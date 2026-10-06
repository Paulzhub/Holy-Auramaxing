begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- Two people, A and B, created through the real sign-up path.
create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
end;
$$;

select pg_temp.make_user('00000000-0000-7000-8000-0000000000a2', 'sec-a@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-0000000000b2', 'sec-b@example.test');

-- Sessions: A has two (a1 = this device, a2 = a laptop), B has one.
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('00000000-0000-7000-8000-00000000a201', '00000000-0000-7000-8000-0000000000a2', now() - interval '2 days', now(), 'aal1'),
  ('00000000-0000-7000-8000-00000000a202', '00000000-0000-7000-8000-0000000000a2', now() - interval '1 day', now(), 'aal1'),
  ('00000000-0000-7000-8000-00000000b201', '00000000-0000-7000-8000-0000000000b2', now(), now(), 'aal1');

-- A signed-in request: user, session and assurance level.
create function pg_temp.as_session(uid uuid, sid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', aal)::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select set_config('role', 'service_role', true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

-- ---------------------------------------------------------------- devices (server only)
select pg_temp.as_session('00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-00000000a201', 'aal1');
select throws_ok($$ select public.record_session_device('00000000-0000-7000-8000-0000000000a2',
                   '00000000-0000-7000-8000-00000000a201', repeat('a', 43), 'Chrome on Windows') $$,
  '42501', null, 'Members cannot record devices themselves');

select pg_temp.as_service();
select is(public.record_session_device('00000000-0000-7000-8000-0000000000a2',
  '00000000-0000-7000-8000-00000000a201', repeat('a', 43), 'Chrome on Windows'), 'first',
  'The first device of an account is "first" (no email)');
select is(public.record_session_device('00000000-0000-7000-8000-0000000000a2',
  '00000000-0000-7000-8000-00000000a201', repeat('a', 43), 'Chrome on Windows'), 'known',
  'The same device again is "known"');
select is(public.record_session_device('00000000-0000-7000-8000-0000000000a2',
  '00000000-0000-7000-8000-00000000a202', repeat('b', 43), 'Firefox on Linux'), 'new',
  'Another device is "new" (email)');
select is(public.record_session_device('00000000-0000-7000-8000-0000000000b2',
  '00000000-0000-7000-8000-00000000b201', repeat('a', 43), 'Safari on iOS'), 'first',
  'Devices are per person: B''s first device is "first" even with the same cookie hash');
select throws_ok($$ select public.record_session_device('00000000-0000-7000-8000-0000000000b2',
                   '00000000-0000-7000-8000-00000000b201', 'not a hash', 'Safari on iOS') $$,
  '23514', null, 'Device hashes must look like SHA-256 base64url');

-- ---------------------------------------------------------------- live session, no two-factor
select pg_temp.as_session('00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-00000000a201', 'aal1');
select is((select count(*) from public.profiles), 1::bigint, 'A live aal1 session without two-factor reads its profile');
select results_eq($$ select session_active, mfa_pending from public.auth_gate() $$,
  $$ values (true, false) $$, 'auth_gate: active, nothing pending');

select results_eq($$ select device, is_current from public.my_sessions() order by device $$,
  $$ values ('Chrome on Windows'::text, true), ('Firefox on Linux'::text, false) $$,
  'A sees both own sessions, with device names and which one is current');
select is((select count(*) from public.my_sessions() where id = '00000000-0000-7000-8000-00000000b201'), 0::bigint,
  'A never sees B''s session');
select ok(pg_get_function_result('public.my_sessions()'::regprocedure) !~ '\mip\M', 'my_sessions() returns no IP address');
select throws_ok($$ select * from private.known_devices $$, '42501', null, 'Members cannot read device tables');
select throws_ok($$ select * from private.session_devices $$, '42501', null, 'Members cannot read session-device rows');

select is(public.revoke_my_session('00000000-0000-7000-8000-00000000b201'), false, 'A cannot sign out B''s session');
select pg_temp.as_postgres();
select is((select count(*) from auth.sessions where id = '00000000-0000-7000-8000-00000000b201'), 1::bigint,
  'B''s session is untouched');

select pg_temp.as_session('00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-00000000a201', 'aal1');
select is(public.revoke_my_session('00000000-0000-7000-8000-00000000a202'), true, 'A signs out the laptop session');
select pg_temp.as_postgres();
select is((select count(*) from auth.sessions where id = '00000000-0000-7000-8000-00000000a202'), 0::bigint,
  'The laptop session is gone');

-- ---------------------------------------------------------------- a signed-out session reads nothing
select pg_temp.as_session('00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-00000000a202', 'aal1');
select is((select count(*) from public.profiles), 0::bigint, 'A signed-out session''s token reads no profile');
select is((select count(*) from public.consents), 0::bigint, 'nor consents');
select is_empty($$ update public.profiles set bio = 'from a revoked token'
                   where id = '00000000-0000-7000-8000-0000000000a2' returning id $$,
  'and cannot write');
select results_eq($$ select session_active from public.auth_gate() $$, $$ values (false) $$,
  'auth_gate reports the session as ended');
select is((select count(*) from public.my_sessions()), 0::bigint, 'and my_sessions() returns nothing');

-- ---------------------------------------------------------------- two-factor on: aal1 is not enough
select pg_temp.as_postgres();
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('00000000-0000-7000-8000-00000000f201', '00000000-0000-7000-8000-0000000000a2', 'Authenticator app',
        'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');

select pg_temp.as_session('00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-00000000a201', 'aal1');
select is((select count(*) from public.profiles), 0::bigint, 'With two-factor on, an aal1 session reads no profile');
select is((select count(*) from public.privacy_settings), 0::bigint, 'nor privacy settings');
select is((select count(*) from public.notification_settings), 0::bigint, 'nor notification settings');
select is((select count(*) from public.profile_private), 0::bigint, 'nor private text');
select is((select count(*) from public.profile_cards), 0::bigint, 'nor profile cards');
select is_empty($$ update public.profiles set bio = 'with only a password'
                   where id = '00000000-0000-7000-8000-0000000000a2' returning id $$,
  'and cannot edit the profile');
select results_eq($$ select session_active, mfa_pending from public.auth_gate() $$,
  $$ values (true, true) $$, 'auth_gate: two-factor pending');
select throws_ok($$ select public.replace_recovery_codes(array_fill(repeat('0', 64), array[10])) $$,
  '42501', null, 'Recovery codes cannot be created at aal1');

select pg_temp.as_session('00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-00000000a201', 'aal2');
select is((select count(*) from public.profiles), 1::bigint, 'At aal2 the profile is readable again');

-- ---------------------------------------------------------------- recovery codes
select is(public.replace_recovery_codes(
  array(select lpad(to_hex(i), 64, '0') from generate_series(1, 10) as i)), 10, 'A creates ten codes at aal2');
select is(public.recovery_codes_remaining(), 10, 'and has ten left');
select throws_ok($$ select public.replace_recovery_codes(array['ab']) $$, '22023', null, 'Exactly ten codes, no fewer');
select throws_ok($$ select public.use_recovery_code('00000000-0000-7000-8000-0000000000a2', lpad('1', 64, '0')) $$,
  '42501', null, 'Members cannot redeem codes directly (the server rate-limits that)');
select throws_ok($$ select * from private.mfa_recovery_codes $$, '42501', null, 'Members cannot read the code hashes');

select pg_temp.as_service();
select is(public.use_recovery_code('00000000-0000-7000-8000-0000000000a2', lpad('1', 64, '0')), true,
  'A valid code works once');
select is(public.use_recovery_code('00000000-0000-7000-8000-0000000000a2', lpad('1', 64, '0')), false,
  'and never twice');
select is(public.use_recovery_code('00000000-0000-7000-8000-0000000000b2', lpad('2', 64, '0')), false,
  'A''s code does nothing for B');

select pg_temp.as_session('00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-00000000a201', 'aal2');
select is(public.recovery_codes_remaining(), 9, 'A has nine left');

-- ---------------------------------------------------------------- anonymous callers
select pg_temp.as_anon();
select throws_ok($$ select * from public.my_sessions() $$, '42501', null, 'Signed-out visitors cannot list sessions');

select * from finish();
rollback;
