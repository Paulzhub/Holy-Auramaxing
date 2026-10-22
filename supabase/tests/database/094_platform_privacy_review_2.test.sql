-- Privacy and discretion review 2 (docs/privacy-review-2.md, D-099 to D-101).
--   - A reflection (offered only after a slip) leaves nothing in the security log.
--   - A changed answer pings only the groups that can see the change.
--   - Why a partnership ended stays ours.
--   - Nudges and ended partnerships go after 90 days; the scheduler's log after 7.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'UTC' where profiles.id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.set(k text, v text) returns void language sql as $$ select set_config('test.' || k, v, true) $$;
create function pg_temp.get(k text) returns uuid language sql as $$ select current_setting('test.' || k)::uuid $$;
create function pg_temp.add_member(gid uuid, uid uuid, level text) returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (gid, uid, 'member', 'active', level, now(), now());
$$;
create function pg_temp.topic(gid uuid) returns text language sql as $$
  select private.group_topic(gid, (now() at time zone 'utc')::date)
$$;
create function pg_temp.pinged(gid uuid) returns boolean language sql as $$
  select exists (select 1 from realtime.messages where topic = pg_temp.topic(gid))
$$;

\set o '''00000000-0000-7000-8000-000000009401'''
\set m '''00000000-0000-7000-8000-000000009402'''
\set p '''00000000-0000-7000-8000-000000009403'''
select pg_temp.make_user(:o, 'pr2-owner@example.test');
select pg_temp.make_user(:m, 'pr2-member@example.test');
select pg_temp.make_user(:p, 'pr2-partner@example.test');

select pg_temp.as_user(:o);
select pg_temp.set('quiet', public.create_group('Quiet group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'A covenant.', 'checkin_only', true, 'full')::text);
select pg_temp.set('open', public.create_group('Open group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'A covenant.', 'checkin_only', true, 'full')::text);
select pg_temp.as_postgres();
select pg_temp.add_member(pg_temp.get('quiet'), :m, 'checkin_only');
select pg_temp.add_member(pg_temp.get('open'), :m, 'streak');
select pg_temp.add_member(pg_temp.get('quiet'), :p, 'checkin_only');

-- ---------------------------------------------------------------- PR2-3 the reflection

select pg_temp.as_user(:m);
select public.submit_checkin(util.local_today('UTC'), 'slipped');
select lives_ok($$ select public.save_checkin_reflection(util.local_today('UTC'), '{lonely}', null) $$,
  'The reflection after a slip saves');
select pg_temp.as_postgres();
select is((select count(*) from public.audit_log where actor_id = :m and action like 'checkin.%'), 0::bigint,
  '... and leaves nothing in the security log, so it can''t mark the day as a slip (D-099)');
select is((select count(*) from public.audit_log where metadata ->> 'part' = 'reflection'), 0::bigint,
  'No earlier reflection entries are left either');
select pg_temp.as_user(:m);
select public.submit_checkin(util.local_today('UTC'), 'clean');
select pg_temp.as_postgres();
select is((select array_agg(action) from public.audit_log where actor_id = :m and action like 'checkin.%'),
  array['checkin.edited'], 'A changed answer is still audited (§7.5)');

-- ---------------------------------------------------------------- PR2-5 pings

delete from realtime.messages;
update public.checkins set outcome = 'slipped' where user_id = :m;
select ok(pg_temp.pinged(pg_temp.get('open')), 'A changed answer pings the group that sees the streak');
select ok(not pg_temp.pinged(pg_temp.get('quiet')),
  '... but not the group that sees only "checked in", where nothing it can see changed (D-101)');

delete from realtime.messages;
insert into public.partnerships (group_id, user_a, user_b, status, accepted_at)
values (pg_temp.get('quiet'), :m, :p, 'active', now());
update public.checkins set outcome = 'clean' where user_id = :m;
select ok(pg_temp.pinged(pg_temp.get('quiet')), 'With a partner there, who sees the answer, that group is pinged too');

delete from realtime.messages;
delete from public.partnerships where user_a = :m;
delete from public.checkins where user_id = :m;
insert into public.checkins (user_id, local_date, timezone, outcome) values (:m, util.local_today('UTC'), 'UTC', 'clean');
select ok(pg_temp.pinged(pg_temp.get('quiet')) and pg_temp.pinged(pg_temp.get('open')),
  'A new check-in still pings every group ("checked in: yes" shows everywhere)');

-- ---------------------------------------------------------------- PR2-6 partnerships

select ok(not has_column_privilege('authenticated', 'public.partnerships', 'ended_reason', 'select'),
  'Nobody reads why a partnership ended ("blocked", "closing") through the API');
select ok(has_column_privilege('authenticated', 'public.partnerships', 'status', 'select')
          and has_column_privilege('authenticated', 'public.partnerships', 'ended_at', 'select'),
  '... while the two people still read the rest of it');

-- ---------------------------------------------------------------- PR2-6, PR2-7 retention

insert into public.nudges (group_id, from_user, to_user, kind, sender_day, created_at) values
  (pg_temp.get('quiet'), :m, :p, 'pray_for_me', current_date - 91, now() - interval '91 days'),
  (pg_temp.get('quiet'), :p, :m, 'praying', current_date - 1, now() - interval '1 day');
insert into public.partnerships (group_id, user_a, user_b, status, requested_at, accepted_at, ended_at, ended_reason) values
  (pg_temp.get('quiet'), :m, :p, 'ended', now() - interval '120 days', now() - interval '119 days',
   now() - interval '91 days', 'blocked'),
  (pg_temp.get('open'), :m, :o, 'ended', now() - interval '10 days', now() - interval '9 days',
   now() - interval '2 days', 'ended');
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
values (1, 9400001, 1, 'postgres', 'postgres', 'select 1', 'succeeded', '1 row', now() - interval '8 days',
        now() - interval '8 days'),
       (1, 9400002, 1, 'postgres', 'postgres', 'select 1', 'succeeded', '1 row', now() - interval '1 day',
        now() - interval '1 day');

select is(private.privacy_retention(now()) ->> 'nudges', '1', 'The daily clean-up removes nudges older than 90 days');
select is((select array_agg(kind) from public.nudges where :m in (from_user, to_user)), array['praying'],
  '... and keeps recent ones');
select is((select array_agg(ended_reason) from public.partnerships where :m in (user_a, user_b)), array['ended'],
  'Partnerships that ended over 90 days ago go; recent ones stay');
select is((select array_agg(runid order by runid) from cron.job_run_details where runid between 9400001 and 9400002),
  array[9400002::bigint], 'The scheduler''s run log keeps 7 days');
select is((select count(*) from cron.job where jobname = 'privacy-retention' and schedule = '41 3 * * *'), 1::bigint,
  'The clean-up runs every day');
select ok(not has_function_privilege('authenticated', 'private.privacy_retention(timestamptz)', 'execute'),
  '... and nobody can call it through the API');

select * from finish();
rollback;
