-- Security review 1, finding SR-2 (D-051): the write functions throttle
-- themselves.
--
-- The app's rate limits live in its server actions, but anyone signed in can
-- call these functions straight through the Data API with their own token
-- and skip the app entirely. Each write function therefore counts calls per
-- person in the database too, a little above the app's own limit, and
-- answers SQLSTATE PT429 (HTTP 429 from PostgREST) once over it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
end;
$$;
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
-- Calls f n times; returns how many calls succeeded.
create function pg_temp.repeat_ok(sql text, n integer) returns integer language plpgsql as $$
declare ok integer := 0;
begin
  for i in 1..n loop
    begin
      execute sql;
      ok := ok + 1;
    exception when others then
      null;
    end;
  end loop;
  return ok;
end;
$$;

select pg_temp.make_user('00000000-0000-7000-8000-000000000e01', 'jonah@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000e02', 'micah@example.test');

-- ---------------------------------------------------------------- check-ins

select pg_temp.as_user('00000000-0000-7000-8000-000000000e01');
select is(
  pg_temp.repeat_ok($$ select public.submit_checkin(util.local_today('UTC'), 'clean') $$, 40), 40,
  'Forty check-in saves in an hour go through (the app allows 30)');
select throws_ok($$ select public.submit_checkin(util.local_today('UTC'), 'clean') $$,
  'PT429', 'rate_limited', 'The next one called straight through the API is refused');
select throws_ok($$ select public.save_checkin_reflection(util.local_today('UTC'), '{}', null) $$,
  'PT429', 'rate_limited', '... and so is a reflection, which shares the count');

select pg_temp.as_user('00000000-0000-7000-8000-000000000e02');
select lives_ok($$ select public.submit_checkin(util.local_today('UTC'), 'clean') $$,
  'Someone else''s count is their own');

-- A new window starts afresh.
select pg_temp.as_postgres();
update private.rate_limit_counters set window_started_at = now() - interval '2 hours'
 where user_id = '00000000-0000-7000-8000-000000000e01';
select pg_temp.as_user('00000000-0000-7000-8000-000000000e01');
select lives_ok($$ select public.submit_checkin(util.local_today('UTC'), 'slipped') $$,
  'After the window, saving works again');

-- ---------------------------------------------------------------- groups

select set_config('test.g', public.create_group('Ninevites', null, 'ongoing', null, current_date, 'UTC', 50,
                  'invite_only', 'We turn around together.', 'checkin_only', true, 'checkin_only')::text, true);
select is(
  pg_temp.repeat_ok($$ select public.update_my_group_membership(current_setting('test.g')::uuid, 'streak', false) $$,
                    150), 150,
  'A hundred and fifty group changes in an hour go through (the app allows 120)');
select throws_ok($$ select public.update_my_group_membership(current_setting('test.g')::uuid, 'full', false) $$,
  'PT429', 'rate_limited', 'The next group change is refused');
select throws_ok($$ select public.create_group_invite(current_setting('test.g')::uuid, repeat('a', 64),
                                                      repeat('b', 64), 7, null) $$,
  'PT429', 'rate_limited', '... including making an invite (every group change shares the count)');

select pg_temp.as_user('00000000-0000-7000-8000-000000000e02');
select is(
  pg_temp.repeat_ok($$ select public.create_group('Tarshish ' || gen_random_uuid(), null, 'ongoing', null,
                                                  current_date, 'UTC', 50, 'invite_only',
                                                  'We sail the other way.', 'checkin_only', true, 'checkin_only') $$,
                    8), 8,
  'Eight new groups in a day go through');
select throws_ok($$ select public.create_group('One more', null, 'ongoing', null, current_date, 'UTC', 50,
                   'invite_only', 'We sail the other way.', 'checkin_only', true, 'checkin_only') $$,
  'PT429', 'rate_limited', 'The ninth is refused (the app allows 5; owning ten is the separate cap)');

select * from finish();
rollback;
