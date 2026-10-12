-- Leaderboards (CLAUDE.md §7.6, D-074): five boards per group; ties go to
-- whoever got there first; checkin_only members appear only on the XP and
-- Encourager boards; hiding works only while the covenant allows it, and a
-- hidden member keeps their place without a name; closing accounts are left
-- out; "this week" reads 0 once the week has turned; a level or streak that
-- has fallen since it was stored is recalculated when the board is read.
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'UTC', created_at = now() - interval '60 days' where profiles.id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.g() returns uuid language sql as $$ select current_setting('test.g')::uuid $$;
create function pg_temp.today() returns date language sql as $$ select util.local_today('UTC') $$;
create function pg_temp.add_member(uid uuid, share text, hidden boolean default false) returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, leaderboard_hidden,
                                    covenant_accepted_at, joined_at)
  values (pg_temp.g(), uid, 'member', 'active', share, hidden, now(), now() - interval '30 days');
$$;
-- Check-ins from p_start (c = free, s = slipped, . = none), each made at
-- p_made + n minutes, then streaks, levels and the queue.
create function pg_temp.seq(uid uuid, p_start date, pattern text, p_made timestamptz default now())
returns void language plpgsql as $$
begin
  insert into public.checkins (user_id, local_date, timezone, outcome, created_at)
  select uid, p_start + (n - 1), 'UTC', case substr(pattern, n, 1) when 'c' then 'clean' else 'slipped' end,
         p_made + make_interval(mins => n)
    from generate_series(1, length(pattern)) n
   where substr(pattern, n, 1) in ('c', 's');
  perform private.recompute_user_stats(uid);
  perform private.recompute_level(uid);
end;
$$;
create function pg_temp.board(p_board text, p_period text default 'all')
returns table (place integer, member_id uuid, score integer, is_me boolean, is_hidden boolean)
language sql as $$ select * from public.group_leaderboard(pg_temp.g(), p_board, p_period, 0, 100) $$;
create function pg_temp.ids(p_board text, p_period text default 'all') returns uuid[] language sql as $$
  select array_agg(member_id order by place) from pg_temp.board(p_board, p_period)
$$;

\set o '''00000000-0000-7000-8000-000000007001'''
\set a '''00000000-0000-7000-8000-000000007002'''
\set b '''00000000-0000-7000-8000-000000007003'''
\set c '''00000000-0000-7000-8000-000000007004'''
\set d '''00000000-0000-7000-8000-000000007005'''
\set x '''00000000-0000-7000-8000-000000007006'''
\set f '''00000000-0000-7000-8000-000000007007'''
\set n '''00000000-0000-7000-8000-000000007008'''
select pg_temp.make_user(:o, 'lb-owner@example.test');
select pg_temp.make_user(:a, 'lb-a@example.test');
select pg_temp.make_user(:b, 'lb-b@example.test');
select pg_temp.make_user(:c, 'lb-c@example.test');
select pg_temp.make_user(:d, 'lb-d@example.test');
select pg_temp.make_user(:x, 'lb-x@example.test');
select pg_temp.make_user(:f, 'lb-f@example.test');
select pg_temp.make_user(:n, 'lb-n@example.test');

-- The owner (full, no check-ins); a (full, 5 free days); b (streak, 3 free
-- days); c (checkin_only, 5 free days); d (full, hidden, 2 free days); x
-- (full, 3 free days, made before b's); f (closing account, 6 free days);
-- n (not a member).
select pg_temp.as_user(:o);
select set_config('test.g', public.create_group('Leaderboard group', null, 'ongoing', null, current_date, 'UTC', 50,
                  'invite_only', 'A covenant for the board.', 'checkin_only', true, 'full')::text, true);
select pg_temp.as_postgres();
update public.groups set start_date = pg_temp.today() - 20 where id = pg_temp.g();
update public.group_members set joined_at = now() - interval '30 days' where group_id = pg_temp.g();
select pg_temp.add_member(:a, 'full');
select pg_temp.add_member(:b, 'streak');
select pg_temp.add_member(:c, 'checkin_only');
select pg_temp.add_member(:d, 'full', true);
select pg_temp.add_member(:x, 'full');
select pg_temp.add_member(:f, 'full');
select pg_temp.seq(:a, pg_temp.today() - 4, 'ccccc', now() - interval '10 days');
select pg_temp.seq(:b, pg_temp.today() - 2, 'ccc', now() - interval '2 days');
select pg_temp.seq(:x, pg_temp.today() - 2, 'ccc', now() - interval '5 days');
select pg_temp.seq(:c, pg_temp.today() - 4, 'ccccc', now() - interval '9 days');
select pg_temp.seq(:d, pg_temp.today() - 1, 'cc', now() - interval '1 day');
select pg_temp.seq(:f, pg_temp.today() - 5, 'cccccc', now() - interval '11 days');
update public.profiles set deletion_requested_at = now() where id = :f;
-- Encouragement given in this group (Phase 6 will write these): a and x both 3,
-- x's earlier.
insert into public.xp_ledger (user_id, group_id, local_date, reason, points, source_key, revision, created_at)
values (:a, pg_temp.g(), pg_temp.today(), 'encouragement', 3, 'encouragement:test-a', 1, now() - interval '1 hour'),
       (:x, pg_temp.g(), pg_temp.today(), 'encouragement', 3, 'encouragement:test-x', 1, now() - interval '3 hours');
select private.run_jobs(1000, true);
select private.refresh_leaderboard(pg_temp.g());

-- ---------------------------------------------------------------- stored rows

select is((select count(*) from public.leaderboard_entries where group_id = pg_temp.g()), 7::bigint,
  'One stored row per active membership');
select is((select xp from public.leaderboard_entries where group_id = pg_temp.g() and user_id = :a),
          (select xp_in_group from public.group_member_stats where group_id = pg_temp.g() and user_id = :a),
  'Stored XP is the group''s Consistency XP (xp_in_group)');
select is((select stale_at from public.leaderboard_entries where group_id = pg_temp.g() and user_id = :a),
          util.window_close(pg_temp.today() + 1, 'UTC'),
  'stale_at: a checked in today, so nothing can fall before tomorrow''s window closes');
select is((select stale_at from public.leaderboard_entries where group_id = pg_temp.g() and user_id = :o),
          null::timestamptz, 'stale_at is empty when there is nothing left to fall (Level 0, no streak)');

-- ---------------------------------------------------------------- reading

select pg_temp.as_user(:a);
select is((select count(*) from pg_temp.board('xp')), 6::bigint,
  'XP board: every active member except the closing account');
select ok(:c::uuid = any (pg_temp.ids('xp')), 'A checkin_only member is on the XP board');
select ok(:c::uuid = any (pg_temp.ids('encourager')), '... and on the Encourager board');
select ok(array_position(coalesce(pg_temp.ids('streak'), '{}'), :c::uuid) is null, '... but never on Current streak');
select ok(array_position(coalesce(pg_temp.ids('level'), '{}'), :c::uuid) is null, '... nor on Level');
select ok(array_position(coalesce(pg_temp.ids('free_days'), '{}'), :c::uuid) is null, '... nor on Free days this challenge');
select ok(array_position(coalesce(pg_temp.ids('free_days', 'week'), '{}'), :c::uuid) is null, '... nor its this-week view');
select ok(array_position(coalesce(pg_temp.ids('free_days'), '{}'), :f::uuid) is null, 'A closing account is on no board');

select is((select array_agg(score order by place) from pg_temp.board('streak')), array[5, 3, 3, 2, 0],
  'Current streak: 5, 3, 3, 2, 0');
select is((select array_agg(score order by place) from pg_temp.board('level')),
          (select array_agg(l order by l desc) from (values (util.member_level(:a)), (util.member_level(:b)),
            (util.member_level(:x)), (util.member_level(:d)), (util.member_level(:o))) v(l)),
  'Level: the live level of each member who shares their streak or more');
select is((select array_agg(place order by place) from pg_temp.board('free_days')), array[1, 2, 3, 4, 5],
  'Places are 1..n with no shared places');
select is((select member_id from pg_temp.board('free_days') where place = 2), :x::uuid,
  'Tie on free days (3 each): x got there first, so x ranks above b');
select is((select member_id from pg_temp.board('encourager') where place = 1), :x::uuid,
  'Tie on encouragement (3 each): x got there first');
select is((select array_agg(score order by place) from pg_temp.board('encourager') where place <= 2), array[3, 3],
  'Encourager reads encouragement XP given in this group');

-- Hidden: d keeps a place, with no id, except to d.
select is((select count(*) from pg_temp.board('free_days') where is_hidden and member_id is null), 1::bigint,
  'A hidden member keeps their place on the board, without an id (owner, 2026-10-12)');
select ok(array_position(coalesce(pg_temp.ids('xp'), '{}'), :d::uuid) is null, '... nobody else learns who it is');
select pg_temp.as_user(:d);
select is((select member_id from pg_temp.board('xp') where is_me), :d::uuid, '... but they see themselves');
select is((select is_hidden from pg_temp.board('xp') where is_me), true, '... marked as hidden');
-- The covenant stops allowing it: the flag no longer hides anyone.
select pg_temp.as_postgres();
update public.groups set leaderboard_hiding_allowed = false where id = pg_temp.g();
select pg_temp.as_user(:a);
select ok(:d::uuid = any (pg_temp.ids('xp')), 'Hiding works only while the covenant allows it');
select pg_temp.as_postgres();
update public.groups set leaderboard_hiding_allowed = true where id = pg_temp.g();

-- Paging: a page plus my own row.
select pg_temp.as_user(:o);
select is((select count(*) from public.group_leaderboard(pg_temp.g(), 'streak', 'all', 0, 2)), 3::bigint,
  'A page of 2 plus my own row further down');
select is((select array_agg(place order by place) from public.group_leaderboard(pg_temp.g(), 'streak', 'all', 2, 2)
            where not is_me), array[3, 4], 'The next page starts after the last place shown');

-- ---------------------------------------------------------------- this week and live values

select pg_temp.as_postgres();
update public.leaderboard_entries set week_of = week_of - 7 where group_id = pg_temp.g() and user_id = :a;
select pg_temp.as_user(:o);
select is((select score from pg_temp.board('xp', 'week') where member_id = :a), 0,
  'This week: a row stored in an earlier week reads 0 (no job needed when the week turns)');
select ok((select score from pg_temp.board('xp', 'all') where member_id = :a) > 0, '... the all-time view is unchanged');

select pg_temp.as_postgres();
update public.leaderboard_entries set level = 99, streak = 99 where group_id = pg_temp.g() and user_id = :b;
select pg_temp.as_user(:o);
select is((select score from pg_temp.board('level') where member_id = :b), 99,
  'Before stale_at the stored level is used (it can''t have fallen yet)');
select pg_temp.as_postgres();
update public.leaderboard_entries set stale_at = now() - interval '1 minute' where group_id = pg_temp.g() and user_id = :b;
select pg_temp.as_user(:o);
select is((select score from pg_temp.board('level') where member_id = :b), util.member_level(:b),
  'Past stale_at the board reads the live level, not the stored one');
select is((select score from pg_temp.board('streak') where member_id = :b), 3,
  '... and the live streak');
select pg_temp.as_postgres();
select ok(private.queue_leaderboard_ticks() >= 1, 'The tick queues the person whose stored values went stale');
select private.run_jobs(1000, true);
select is((select level from public.leaderboard_entries where group_id = pg_temp.g() and user_id = :b),
          util.member_level(:b), '... and the job brings the stored row up to date');

-- ---------------------------------------------------------------- refused

select pg_temp.as_user(:n);
select throws_ok($$ select * from public.group_leaderboard(pg_temp.g()) $$, '42501', 'group_not_found',
  'Someone outside the group gets group_not_found');
select pg_temp.as_user(:a);
select throws_ok($$ select * from public.group_leaderboard(pg_temp.g(), 'level', 'week') $$, '22023', 'invalid_input',
  'Level and Current streak have no this-week view');
select pg_temp.as_postgres();
update public.group_members set status = 'removed' where group_id = pg_temp.g() and user_id = :x;
select is((select count(*) from public.leaderboard_entries where group_id = pg_temp.g() and user_id = :x), 0::bigint,
  'A removed member''s row goes at once');
select lives_ok($$ select private.enqueue('leaderboard', jsonb_build_object('group', pg_temp.g())) $$,
  'leaderboard is a known job type');

select * from finish();
rollback;
