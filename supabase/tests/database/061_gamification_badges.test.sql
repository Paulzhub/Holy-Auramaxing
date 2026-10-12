-- Badges and finishing a challenge (CLAUDE.md §7.6, D-071, D-072): badges
-- for days in a row are awarded once and kept, even when an edit lowers the
-- streak; finishing a challenge pays +100 and Faithful Finisher once, only to
-- members active on its last day; groups see badges only where the member
-- shares their streak or more; group XP counts days inside the challenge.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'Asia/Kolkata', created_at = '2026-07-01 00:00+05:30' where profiles.id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.seq(uid uuid, p_start date, pattern text) returns void language plpgsql as $$
begin
  insert into public.checkins (user_id, local_date, timezone, outcome)
  select uid, p_start + (n - 1), 'Asia/Kolkata', case substr(pattern, n, 1) when 'c' then 'clean' else 'slipped' end
    from generate_series(1, length(pattern)) n
   where substr(pattern, n, 1) in ('c', 's');
  perform private.recompute_user_stats(uid);
  perform private.run_jobs(1000, true);
end;
$$;
create function pg_temp.badges(uid uuid) returns text[] language sql as $$
  select coalesce(array_agg(badge order by badge), '{}') from public.user_badges where user_id = uid
$$;

\set u '''00000000-0000-7000-8000-000000006101'''
\set o '''00000000-0000-7000-8000-000000006102'''
\set x '''00000000-0000-7000-8000-000000006103'''
\set y '''00000000-0000-7000-8000-000000006104'''
\set z '''00000000-0000-7000-8000-000000006105'''
\set w '''00000000-0000-7000-8000-000000006106'''
select pg_temp.make_user(:u, 'badge-u@example.test');
select pg_temp.make_user(:o, 'badge-o@example.test');
select pg_temp.make_user(:x, 'badge-x@example.test');
select pg_temp.make_user(:y, 'badge-y@example.test');
select pg_temp.make_user(:z, 'badge-z@example.test');
select pg_temp.make_user(:w, 'badge-w@example.test');

-- ---------------------------------------------------------------- the badge list

select is((select count(*) from public.badges), 18::bigint, 'Eighteen badges are seeded');
select results_eq($$ select threshold from public.badges where kind = 'free_days' order by threshold $$,
  $$ values (1), (3), (7), (14), (21), (30), (40), (60), (90), (180), (365) $$, 'Free-day milestones (§7.6)');
select results_eq($$ select threshold from public.badges where kind = 'checkin_days' order by threshold $$,
  $$ values (7), (30), (100) $$, 'Check-in milestones (§7.6)');
select ok((select bool_and(verse_text <> '' and reference <> '' and icon <> '') from public.badges),
  'Every badge has an icon and a verse');
select ok(exists (select 1 from public.badges where slug in ('encourager')) and
          exists (select 1 from public.badges where slug in ('prayer_warrior')) and
          exists (select 1 from public.badges where slug in ('first_testimony')),
  'Encourager, Prayer Warrior and First Testimony are seeded for Phase 6');

-- ---------------------------------------------------------------- awarded once, kept

select pg_temp.seq(:u, '2026-09-01', 'ccccccc');
select is(pg_temp.badges(:u), array['checkin_7', 'free_1', 'free_3', 'free_7'],
  'Seven free days in a row: 1, 3 and 7 free days, and 7 check-ins in a row');
update public.checkins set outcome = 'slipped' where user_id = :u and local_date = '2026-09-04';
select private.recompute_user_stats(:u);
select private.run_jobs(1000, true);
select is((select longest_streak from public.user_stats where user_id = :u), 3, 'An edit lowers the longest run to 3 …');
select is(pg_temp.badges(:u), array['checkin_7', 'free_1', 'free_3', 'free_7'], '… and every badge is kept');
select private.enqueue('user_settle', jsonb_build_object('user', :u));
select private.enqueue('user_settle', jsonb_build_object('user', :u));
select private.run_jobs(1000, true);
select is((select count(*) from public.user_badges where user_id = :u), 4::bigint, 'Replaying awards nothing twice');
select throws_ok($$ delete from public.user_badges where user_id = '00000000-0000-7000-8000-000000006101' $$,
  'P0001', 'user_badges_kept', 'Badges can''t be taken away');
select throws_ok($$ update public.user_badges set earned_at = now() where user_id = '00000000-0000-7000-8000-000000006101' $$,
  'P0001', 'user_badges_kept', 'Badges can''t be changed');

-- ---------------------------------------------------------------- finishing a challenge

select pg_temp.as_user(:o);
select set_config('test.grp', public.create_group('Finishers', null, '30', null, current_date, 'Asia/Kolkata',
  50, 'invite_only', 'We finish together.', 'checkin_only', true, 'full')::text, true);
select pg_temp.as_postgres();
-- The challenge ran 1 to 30 August.
update public.groups set start_date = '2026-08-01', end_date = '2026-08-30' where id = current_setting('test.grp')::uuid;
insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at) values
  (current_setting('test.grp')::uuid, :x, 'member', 'active', 'streak', now(), '2026-08-10 03:00+00'),
  (current_setting('test.grp')::uuid, :y, 'member', 'active', 'streak', now(), '2026-09-05 03:00+00'),
  (current_setting('test.grp')::uuid, :z, 'member', 'active', 'streak', now(), '2026-08-02 03:00+00'),
  (current_setting('test.grp')::uuid, :w, 'member', 'active', 'checkin_only', now(), '2026-08-02 03:00+00');
update public.group_members set status = 'removed' where user_id = :z;
-- x answered the 20th and 21st (inside) and 1 September (after the end).
select pg_temp.seq(:x, '2026-08-20', 'cc');
select pg_temp.seq(:x, '2026-09-01', 'c');
select pg_temp.seq(:w, '2026-08-20', 'c');

select is(private.queue_challenge_endings('2026-08-30 23:00+05:30'), 0, 'Not before the last day is over');
select is(private.queue_challenge_endings('2026-08-31 00:30+05:30'), 1, 'Queued once the last day is over');
select is(private.queue_challenge_endings('2026-08-31 02:30+05:30'), 0, '… and only once');
select private.run_jobs(1000, true);
select is((select count(*) from public.xp_ledger where user_id = :x and reason = 'challenge_finished'
             and points = 100 and group_id = current_setting('test.grp')::uuid), 1::bigint,
  'Active on the last day: +100 for that group');
select ok('faithful_finisher' = any (pg_temp.badges(:x)), '… and Faithful Finisher');
select is((select count(*) from public.xp_ledger where user_id in (:y, :z) and reason = 'challenge_finished'), 0::bigint,
  'Joined after the end, or removed: nothing');
select private.enqueue('challenge_finished', jsonb_build_object('group', current_setting('test.grp')));
select private.run_jobs(1000, true);
select is((select count(*) from public.xp_ledger where user_id = :x and reason = 'challenge_finished'), 1::bigint,
  'Replaying the finish pays nothing twice');

-- Group XP: the finish, plus check-in XP for the 20th and 21st (not 1 September).
select is((select xp_in_group from public.group_member_stats
            where user_id = :x and group_id = current_setting('test.grp')::uuid),
  100 + (10 + 2) + (10 + 4), 'XP in the group: its own rows plus check-ins inside the challenge');
select is((select xp from public.user_stats where user_id = :x), 100 + 12 + 14 + 12, 'Total XP counts everything');

-- ---------------------------------------------------------------- what the group sees

select pg_temp.as_user(:o);
select is((select badges from public.profile_cards where id = :x), array['faithful_finisher', 'free_1'],
  'A member who shares their streak shows their badges, newest first');
select is((select badges from public.profile_cards where id = :w), null,
  'A member at "check-in only" shows none (a free-day badge could hint at a slip)');
select is((select count(*) from public.user_badges where user_id = :x), 0::bigint,
  'user_badges itself stays owner-only');
select pg_temp.as_postgres();

select * from finish();
rollback;
