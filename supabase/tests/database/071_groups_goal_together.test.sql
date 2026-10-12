-- The "Together" total, the group goal and invite details (CLAUDE.md §7.4,
-- §7.6, D-044, D-075, D-076). Free days together count only members who share
-- their streak or more, so a checkin_only member's answer never moves the
-- number; the goal repeats each week, month, quarter or year and only owners
-- and admins set it (throttled, audited); invite details are for admins only
-- and leave closing accounts out.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

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
create function pg_temp.add_member(uid uuid, share text, r text default 'member', inv uuid default null)
returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at, invite_id)
  values (pg_temp.g(), uid, r, 'active', share, now(), now() - interval '30 days', inv);
$$;
create function pg_temp.seq(uid uuid, p_start date, pattern text) returns void language plpgsql as $$
begin
  insert into public.checkins (user_id, local_date, timezone, outcome)
  select uid, p_start + (n - 1), 'UTC', case substr(pattern, n, 1) when 'c' then 'clean' else 'slipped' end
    from generate_series(1, length(pattern)) n
   where substr(pattern, n, 1) in ('c', 's');
  perform private.recompute_user_stats(uid);
  perform private.recompute_level(uid);
end;
$$;
create function pg_temp.together() returns jsonb language sql as $$ select public.group_together(pg_temp.g()) $$;

\set o '''00000000-0000-7000-8000-000000007101'''
\set s '''00000000-0000-7000-8000-000000007102'''
\set q '''00000000-0000-7000-8000-000000007103'''
\set m '''00000000-0000-7000-8000-000000007104'''
\set p '''00000000-0000-7000-8000-000000007105'''
\set z '''00000000-0000-7000-8000-000000007106'''
select pg_temp.make_user(:o, 'tg-owner@example.test');
select pg_temp.make_user(:s, 'tg-streak@example.test');
select pg_temp.make_user(:q, 'tg-quiet@example.test');
select pg_temp.make_user(:m, 'tg-member@example.test');
select pg_temp.make_user(:p, 'tg-pending@example.test');
select pg_temp.make_user(:z, 'tg-closing@example.test');

select pg_temp.as_user(:o);
select set_config('test.g', public.create_group('Together group', null, 'ongoing', null, current_date, 'UTC', 50,
                  'invite_only', 'A covenant for together.', 'checkin_only', true, 'full')::text, true);
select set_config('test.inv', public.create_group_invite(pg_temp.g(), repeat('7', 64), repeat('8', 64), 7, 10)::text, true);
select pg_temp.as_postgres();
update public.groups set start_date = pg_temp.today() - 20 where id = pg_temp.g();
update public.group_members set joined_at = now() - interval '30 days' where group_id = pg_temp.g();
-- s shares their streak; q only that they checked in; m is a full member; z is
-- closing; p asked to join. s, q, p and z came through the invite.
select pg_temp.add_member(:s, 'streak', 'member', current_setting('test.inv')::uuid);
select pg_temp.add_member(:q, 'checkin_only', 'member', current_setting('test.inv')::uuid);
select pg_temp.add_member(:m, 'full');
select pg_temp.add_member(:z, 'full', 'member', current_setting('test.inv')::uuid);
insert into public.group_members (group_id, user_id, status, share_level, covenant_accepted_at, invite_id)
values (pg_temp.g(), :p, 'pending', 'full', now(), current_setting('test.inv')::uuid);
select pg_temp.seq(:o, pg_temp.today() - 1, 'cc');
select pg_temp.seq(:s, pg_temp.today() - 2, 'ccc');
select pg_temp.seq(:q, pg_temp.today() - 3, 'ccc');
select pg_temp.seq(:m, pg_temp.today() - 1, 'sc');
select pg_temp.seq(:z, pg_temp.today() - 3, 'cccc');
update public.profiles set deletion_requested_at = now() where id = :z;
select private.run_jobs(1000, true);

-- ---------------------------------------------------------------- Together

select pg_temp.as_user(:m);
select is((pg_temp.together() ->> 'free_days')::integer, 2 + 3 + 1,
  'Free days together: only members at streak or full (2 + 3 + 1), not the checkin_only member''s 3');
select is((pg_temp.together() ->> 'members_counted')::integer, 3, '3 members counted');
select is((pg_temp.together() ->> 'members_total')::integer, 4, 'of 4 (the closing account isn''t counted at all)');
select is(pg_temp.together() -> 'goal', 'null'::jsonb, 'No goal yet');

-- q answers today: free, then slipped. The total doesn't move either way.
select pg_temp.as_postgres();
select pg_temp.seq(:q, pg_temp.today(), 'c');
select private.run_jobs(1000, true);
select pg_temp.as_user(:m);
select is((pg_temp.together() ->> 'free_days')::integer, 6, 'A checkin_only member''s free day doesn''t move the total');
select pg_temp.as_postgres();
update public.checkins set outcome = 'slipped' where user_id = :q and local_date = pg_temp.today();
select private.run_jobs(1000, true);
select pg_temp.as_user(:m);
select is((pg_temp.together() ->> 'free_days')::integer, 6, '... and neither does their slip (D-044)');

-- ---------------------------------------------------------------- the goal

select pg_temp.as_user(:m);
select throws_ok($$ select public.set_group_goal(pg_temp.g(), 'month', 500) $$, '42501', 'group_forbidden',
  'A member can''t set the goal');
select pg_temp.as_user(:o);
select throws_ok($$ select public.set_group_goal(pg_temp.g(), 'fortnight', 500) $$, 'P0001', 'invalid_input',
  'Only week, month, quarter or year');
select throws_ok($$ select public.set_group_goal(pg_temp.g(), 'month', 0) $$, 'P0001', 'invalid_input',
  'The target is at least 1');
select lives_ok($$ select public.set_group_goal(pg_temp.g(), 'month', 500) $$, 'The owner sets "500 free days this month"');
select pg_temp.as_postgres();
select ok(exists (select 1 from private.rate_limit_counters where user_id = :o and bucket = 'group_goal'),
  'Setting a goal is throttled (private.throttle)');
select ok(exists (select 1 from public.audit_log where action = 'group.goal_set'), '... and audited');
select private.run_jobs(1000, true);
select set_config('test.expected', (select count(*)::text from public.checkins
  where user_id in (:o, :s, :m) and outcome = 'clean'
    and local_date >= date_trunc('month', pg_temp.today()::timestamp)::date), true);
select pg_temp.as_user(:m);
select is(pg_temp.together() #>> '{goal,period}', 'month', 'Members see the goal');
select is((pg_temp.together() #>> '{goal,target}')::integer, 500, '... its target');
select is((pg_temp.together() #>> '{goal,starts_on}')::date, date_trunc('month', pg_temp.today()::timestamp)::date,
  '... and this month''s dates');
select is((pg_temp.together() #>> '{goal,progress}')::integer,
          current_setting('test.expected')::integer,
  'Progress: free days this month from members at streak or full only');
select pg_temp.as_user(:o);
select lives_ok($$ select public.set_group_goal(pg_temp.g(), 'quarter', 2000) $$, 'An admin can change it');
select pg_temp.as_postgres();
select private.run_jobs(1000, true);
select pg_temp.as_user(:m);
select is((pg_temp.together() #>> '{goal,ends_on}')::date,
          (date_trunc('quarter', pg_temp.today()::timestamp) + interval '3 months')::date - 1,
  'A quarter ends on the quarter''s last day');
select pg_temp.as_user(:o);
select public.end_group_goal(pg_temp.g());
select pg_temp.as_user(:m);
select is(pg_temp.together() -> 'goal', 'null'::jsonb, 'Ending the goal removes it');

-- ---------------------------------------------------------------- invite details

select pg_temp.as_user(:o);
select set_eq($$ select member_id, member_status from public.group_invite_people(current_setting('test.inv')::uuid) $$,
  format($$ values (%L::uuid, 'active'), (%L::uuid, 'active'), (%L::uuid, 'pending') $$, :s, :q, :p),
  'Invite details: who joined or asked to join with it, without the closing account');
select pg_temp.as_user(:m);
select throws_ok($$ select * from public.group_invite_people(current_setting('test.inv')::uuid) $$, '42501',
  'group_not_found', 'A member who isn''t an admin can''t see invite details');
select throws_ok($$ select * from public.group_invite_people('00000000-0000-7000-8000-00000000ffff') $$, '42501',
  'group_not_found', 'An unknown invite looks the same');

select * from finish();
rollback;
