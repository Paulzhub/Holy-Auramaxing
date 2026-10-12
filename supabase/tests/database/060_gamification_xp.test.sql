-- XP (CLAUDE.md §7.6, §2.2, D-069, D-071): an honest slip earns exactly what
-- a free day earns; the check-in streak bonus is 2 a day from day 1, up to
-- 20; replaying a job never pays twice; a late check-in that changes later
-- days' bonuses writes reversal rows, never edits; encouragement stops at 10
-- a day; the ledger is append-only and owner-only.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'Asia/Kolkata', created_at = '2026-08-01 00:00+05:30' where profiles.id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
-- Adds check-ins from p_start (c = stayed free, s = slipped, . = none), then
-- updates streaks and lets the worker settle the queue.
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
create function pg_temp.xp(uid uuid) returns integer language sql as $$
  select xp from public.user_stats where user_id = uid
$$;
create function pg_temp.ledger_sum(uid uuid) returns integer language sql as $$
  select coalesce(sum(points), 0)::integer from public.xp_ledger where user_id = uid
$$;
create function pg_temp.rows(uid uuid) returns bigint language sql as $$
  select count(*) from public.xp_ledger where user_id = uid
$$;
create function pg_temp.net(k text) returns integer language sql as $$
  select coalesce(sum(points), 0)::integer from public.xp_ledger where source_key = k
$$;

\set a '''00000000-0000-7000-8000-000000006001'''
\set b '''00000000-0000-7000-8000-000000006002'''
\set c '''00000000-0000-7000-8000-000000006003'''
\set d '''00000000-0000-7000-8000-000000006004'''
\set e '''00000000-0000-7000-8000-000000006005'''
\set f '''00000000-0000-7000-8000-000000006006'''
select pg_temp.make_user(:a, 'xp-a@example.test');
select pg_temp.make_user(:b, 'xp-b@example.test');
select pg_temp.make_user(:c, 'xp-c@example.test');
select pg_temp.make_user(:d, 'xp-d@example.test');
select pg_temp.make_user(:e, 'xp-e@example.test');
select pg_temp.make_user(:f, 'xp-f@example.test');

-- ---------------------------------------------------------------- config

select results_eq($$ select key, points, cap from public.xp_config order by key $$,
  $$ values ('challenge_finished', 100, null::integer), ('checkin', 10, null), ('checkin_streak_bonus', 2, 20),
            ('devotional', 5, null), ('encouragement', 1, 10) $$,
  'XP values: +10 a check-in, +2 a day of streak up to 20, +1 encouragement up to 10 a day, +5 devotional, +100 finishing');

-- ---------------------------------------------------------------- honesty pays the same (§2.2)

select pg_temp.seq(:a, '2026-09-01', 'ccccc');
select pg_temp.seq(:b, '2026-09-01', 'sssss');
select is(pg_temp.xp(:a), 80, 'Five free days: 5 × 10 + (2 + 4 + 6 + 8 + 10) = 80');
select is(pg_temp.xp(:b), 80, 'Five honest slips earn exactly the same 80 (D-069)');
select is(pg_temp.net('checkin:' || :b || ':2026-09-03'), pg_temp.net('checkin:' || :a || ':2026-09-03'),
  'A slipped day and a free day are worth the same check-in XP');
select is(pg_temp.xp(:a), pg_temp.ledger_sum(:a), 'user_stats.xp is the sum of the ledger');

-- ---------------------------------------------------------------- the streak bonus

select pg_temp.seq(:c, '2026-09-01', 'cscscsccccccc.c');
select is(pg_temp.net('checkin_streak:' || :c || ':2026-09-01'), 2, 'Day 1 of a check-in streak: +2 (owner, 2026-10-12)');
select is(pg_temp.net('checkin_streak:' || :c || ':2026-09-10'), 20, 'Day 10: +20, the cap');
select is(pg_temp.net('checkin_streak:' || :c || ':2026-09-13'), 20, 'Day 13: still +20');
select is(pg_temp.net('checkin_streak:' || :c || ':2026-09-15'), 2, 'After a day with no answer, the bonus starts again at +2');
select is(pg_temp.net('checkin:' || :c || ':2026-09-14'), 0, 'No check-in, no XP');

-- ---------------------------------------------------------------- replaying never pays twice

select set_config('test.rows_a', pg_temp.rows(:a)::text, true);
select private.enqueue('user_settle', jsonb_build_object('user', :a));
select private.enqueue('user_settle', jsonb_build_object('user', :a));
select private.enqueue('user_settle', jsonb_build_object('user', :a, 'from', '2026-09-01'));
select private.run_jobs(1000, true);
select private.run_job(jsonb_build_object('type', 'user_settle', 'user', :a));
select is(pg_temp.rows(:a), current_setting('test.rows_a')::bigint, 'Running the same job four more times writes nothing');
select is(pg_temp.xp(:a), 80, '… and the total is still 80');

-- An answer changed from free to slipped: same XP, no new rows.
update public.checkins set outcome = 'slipped' where user_id = :a and local_date = '2026-09-03';
select private.run_jobs(1000, true);
select is(pg_temp.rows(:a), current_setting('test.rows_a')::bigint, 'Changing "stayed free" to "slipped" changes no XP');

-- ---------------------------------------------------------------- reversals

-- d answered the 1st, 2nd, 4th and 5th; the 3rd arrives late (offline sync).
select pg_temp.seq(:d, '2026-09-01', 'cc.cc');
select is(pg_temp.xp(:d), 40 + 2 + 4 + 2 + 4, 'Before the late day: two runs of two');
select pg_temp.seq(:d, '2026-09-03', 'c');
select is(pg_temp.xp(:d), 50 + 2 + 4 + 6 + 8 + 10, 'After it: one run of five (80)');
select results_eq($$ select revision, kind, points from public.xp_ledger
                      where source_key = 'checkin_streak:00000000-0000-7000-8000-000000006004:2026-09-04'
                      order by revision $$,
  $$ values (1, 'award', 2), (2, 'reversal', -2), (3, 'award', 8) $$,
  'The 4th''s bonus: the +2 is reversed, then +8 is awarded (no row is ever edited)');
select is((select count(*) from public.xp_ledger where user_id = :d and kind = 'reversal'), 2::bigint,
  'Two reversals: the 4th and the 5th');
select is((select count(*) from public.xp_ledger where user_id = :d and local_date < '2026-09-03'), 4::bigint,
  'Days before the late one are untouched');

-- ---------------------------------------------------------------- daily caps

select private.enqueue('encouragement', jsonb_build_object('user', :e, 'key', 'reaction:' || n, 'at', '2026-09-10 10:00+05:30'))
  from generate_series(1, 12) n;
select private.run_jobs(1000, true);
select is(pg_temp.xp(:e), 10, 'Twelve encouragements in a day: +10, the cap');
select private.enqueue('encouragement', jsonb_build_object('user', :e, 'key', 'reaction:13', 'at', '2026-09-10 23:59+05:30'));
select private.enqueue('encouragement', jsonb_build_object('user', :e, 'key', 'reaction:14', 'at', '2026-09-11 00:01+05:30'));
select private.run_jobs(1000, true);
select is(pg_temp.xp(:e), 11, 'The cap is per local day: the next morning counts again');
select private.enqueue('encouragement', jsonb_build_object('user', :e, 'key', 'reaction:14', 'at', '2026-09-11 09:00+05:30'));
select private.run_jobs(1000, true);
select is(pg_temp.xp(:e), 11, 'The same encouragement twice counts once');

select private.enqueue('devotional', jsonb_build_object('user', :e, 'key', 'plan-7:day-1', 'at', '2026-09-12 08:00+05:30'));
select private.enqueue('devotional', jsonb_build_object('user', :e, 'key', 'plan-7:day-1', 'at', '2026-09-12 09:00+05:30'));
select private.run_jobs(1000, true);
select is(pg_temp.xp(:e), 16, 'A devotional day: +5, once');

-- ---------------------------------------------------------------- config changes apply forward

update public.xp_config set points = 12 where key = 'checkin';
select pg_temp.seq(:a, '2026-09-06', 'c');
select is(pg_temp.net('checkin:' || :a || ':2026-09-06'), 12, 'A new value applies to days settled from then on');
select is(pg_temp.net('checkin:' || :a || ':2026-09-01'), 10, '… and earlier days keep what they were paid');
update public.xp_config set points = 10 where key = 'checkin';

-- ---------------------------------------------------------------- append-only, owner-only

select throws_ok($$ update public.xp_ledger set points = 999 where user_id = '00000000-0000-7000-8000-000000006001' $$,
  'P0001', 'xp_ledger_append_only', 'Ledger rows can''t be changed');
select throws_ok($$ delete from public.xp_ledger where user_id = '00000000-0000-7000-8000-000000006001' $$,
  'P0001', 'xp_ledger_append_only', 'Ledger rows can''t be removed');

select pg_temp.as_user(:a);
select is((select count(*) from public.xp_ledger where user_id <> :a), 0::bigint, 'People read only their own XP rows');
select ok((select count(*) from public.xp_ledger) > 0, 'They do read their own');
select throws_ok($$ insert into public.xp_ledger (user_id, local_date, reason, points, source_key, revision)
                    values ('00000000-0000-7000-8000-000000006001', '2026-09-20', 'checkin', 1000, 'mine:1', 1) $$,
  '42501', null, 'Nobody can write XP for themselves');
select throws_ok($$ select private.enqueue('devotional', '{}'::jsonb) $$, '42501', null,
  'Nobody can put a job on the queue through the Data API');
select is((select count(*) from public.xp_config), 5::bigint, 'Signed-in people can read the XP values');
select pg_temp.as_postgres();

select throws_ok($$ select private.enqueue('give_me_xp', '{}'::jsonb) $$, 'P0001', 'job_unknown_type',
  'Only known job types can be queued');

-- Erasing an account takes its XP with it.
select pg_temp.seq(:f, '2026-09-01', 'cc');
delete from auth.users where id = :f;
select is((select count(*) from public.xp_ledger where user_id = :f), 0::bigint, 'Erasing an account removes its XP rows');

select * from finish();
rollback;
