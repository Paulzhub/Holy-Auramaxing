-- Leaderboard speed check (CLAUDE.md §14, D-074): a group of 5,000 members,
-- each with 60 days of check-ins and XP, then every board read as a member.
-- Target: under 200 ms a board. Runs inside a transaction that is rolled back.
--
--   npm run bench:leaderboard        (psql against the local database)
--
-- Each board is read with EXPLAIN ANALYZE as a member (Execution Time is the
-- whole function, inner query included).
\timing on
begin;

create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- 5,000 accounts. Triggers are off while seeding (session_replication_role),
-- so the sign-up path is skipped and profiles are written directly; they are
-- back on before anything is measured.
set session_replication_role = replica;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
select ('00000000-0000-7000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'bench-' || i || '@example.test', now(), now(), now()
  from generate_series(1, 5000) i;
insert into public.profiles (id, handle, display_name, timezone, adult_confirmed_at, created_at)
select ('00000000-0000-7000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, 'bench_' || i, 'Bench ' || i,
       'Asia/Kolkata', now(), now() - interval '90 days'
  from generate_series(1, 5000) i;
insert into public.privacy_settings (user_id)
select ('00000000-0000-7000-8000-' || lpad(to_hex(i), 12, '0'))::uuid from generate_series(1, 5000) i;

-- One group (inserted directly: the app caps groups at 500 members).
insert into public.groups (id, name, slug, owner_id, challenge_type, start_date, group_timezone, covenant_text)
values ('00000000-0000-7000-8000-0000000b0000', 'Bench group', 'bench-group',
        '00000000-0000-7000-8000-000000000001', 'ongoing', current_date - 70, 'Asia/Kolkata',
        'A covenant for the bench.');
insert into public.group_members (group_id, user_id, role, status, share_level, leaderboard_hidden,
                                  covenant_accepted_at, joined_at)
select '00000000-0000-7000-8000-0000000b0000', p.id,
       case when p.id = '00000000-0000-7000-8000-000000000001' then 'owner' else 'member' end,
       'active', (array['checkin_only', 'streak', 'full'])[1 + (abs(hashtext(p.id::text)) % 3)],
       abs(hashtext(p.id::text)) % 10 = 0, now(), now() - interval '80 days'
  from public.profiles p where p.id::text like '00000000-0000-7000-8000-%';

-- 60 days of answers (about 1 in 8 slipped, 1 in 10 missed) and their XP.
insert into public.checkins (user_id, local_date, timezone, outcome, created_at)
select p.id, d, 'Asia/Kolkata',
       case when abs(hashtext(p.id::text || d)) % 8 = 0 then 'slipped' else 'clean' end,
       d + time '21:00' + make_interval(secs => abs(hashtext(p.id::text || d || 's')) % 3600)
  from public.profiles p
 cross join generate_series(util.local_today('Asia/Kolkata') - 59, util.local_today('Asia/Kolkata'), interval '1 day') g(d0)
 cross join lateral (select g.d0::date as d) x
 where p.id::text like '00000000-0000-7000-8000-%'
   and abs(hashtext(p.id::text || d || 'm')) % 10 <> 0;
insert into public.xp_ledger (user_id, local_date, reason, points, source_key, revision, created_at)
select c.user_id, c.local_date, 'checkin', 10, 'checkin:' || c.user_id || ':' || c.local_date, 1, c.created_at
  from public.checkins c where c.user_id::text like '00000000-0000-7000-8000-%';
insert into public.xp_ledger (user_id, group_id, local_date, reason, points, source_key, revision, created_at)
select p.id, '00000000-0000-7000-8000-0000000b0000', util.local_today('Asia/Kolkata'), 'encouragement',
       1 + abs(hashtext(p.id::text)) % 9, 'encouragement:bench:' || p.id, 1, now() - interval '1 hour'
  from public.profiles p where p.id::text like '00000000-0000-7000-8000-%';
insert into public.group_goals (group_id, period, target) values ('00000000-0000-7000-8000-0000000b0000', 'month', 50000);

update public.groups set member_count = 5000 where id = '00000000-0000-7000-8000-0000000b0000';
set session_replication_role = origin;

-- Streaks and levels, then the stored boards (what the jobs do).
select count(*) as people_replayed from (
  select private.recompute_user_stats(p.id), private.recompute_level(p.id)
    from public.profiles p where p.id::text like '00000000-0000-7000-8000-%') r;
analyze public.checkins;
analyze public.xp_ledger;
analyze public.group_members;
analyze public.profiles;
analyze public.user_stats;
\echo 'Refreshing the whole group''s stored boards (one leaderboard job for the group):'
select private.refresh_leaderboard('00000000-0000-7000-8000-0000000b0000');
\echo '... and once more, as when a goal changes (rows already there):'
select private.refresh_leaderboard('00000000-0000-7000-8000-0000000b0000');
\echo 'One person''s refresh (what each check-in''s job does):'
select private.refresh_leaderboard(null, '00000000-0000-7000-8000-000000000777');
analyze public.leaderboard_entries;

-- A few stored values gone stale, as between ticks.
update public.leaderboard_entries set stale_at = now() - interval '1 minute'
 where group_id = '00000000-0000-7000-8000-0000000b0000' and abs(hashtext(user_id::text)) % 100 = 0;

select pg_temp.as_user('00000000-0000-7000-8000-000000000777');
\echo '--- Consistency XP, all time (first page of 50 plus my row)'
explain (analyze, buffers, costs off)
select * from public.group_leaderboard('00000000-0000-7000-8000-0000000b0000', 'xp', 'all', 0, 50);
\echo '--- Consistency XP, this week'
explain (analyze, costs off) select * from public.group_leaderboard('00000000-0000-7000-8000-0000000b0000', 'xp', 'week', 0, 50);
\echo '--- Level (live, 1% stale)'
explain (analyze, costs off) select * from public.group_leaderboard('00000000-0000-7000-8000-0000000b0000', 'level', 'all', 0, 50);
\echo '--- Current streak'
explain (analyze, costs off) select * from public.group_leaderboard('00000000-0000-7000-8000-0000000b0000', 'streak', 'all', 0, 50);
\echo '--- Free days this challenge'
explain (analyze, costs off) select * from public.group_leaderboard('00000000-0000-7000-8000-0000000b0000', 'free_days', 'all', 0, 50);
\echo '--- Encourager, this week'
explain (analyze, costs off) select * from public.group_leaderboard('00000000-0000-7000-8000-0000000b0000', 'encourager', 'week', 0, 50);
\echo '--- Page 3 of the XP board'
explain (analyze, costs off) select * from public.group_leaderboard('00000000-0000-7000-8000-0000000b0000', 'xp', 'all', 100, 50);
\echo '--- Together total and goal'
explain (analyze, costs off) select public.group_together('00000000-0000-7000-8000-0000000b0000');

-- The ranking query inside group_leaderboard() (XP, all time), as the
-- function runs it, so the plan itself is visible.
select pg_temp.as_postgres();
\echo '--- Inner query plan: Consistency XP, all time'
explain (analyze, buffers, costs off)
with eligible as (
  select e.*, (m.leaderboard_hidden and g.leaderboard_hiding_allowed) as hidden
    from public.leaderboard_entries e
    join public.groups g on g.id = e.group_id
    join public.group_members m on m.group_id = e.group_id and m.user_id = e.user_id and m.status = 'active'
    join public.profiles p on p.id = e.user_id and p.deleted_at is null and p.deletion_requested_at is null
    left join public.user_stats s on s.user_id = e.user_id
   where e.group_id = '00000000-0000-7000-8000-0000000b0000'
),
ranked as (
  select row_number() over (order by el.xp desc, el.xp_at asc nulls last, el.user_id) as rk, el.user_id, el.xp
    from eligible el
)
select * from ranked where rk <= 50 or user_id = '00000000-0000-7000-8000-000000000777' order by rk;

rollback;
