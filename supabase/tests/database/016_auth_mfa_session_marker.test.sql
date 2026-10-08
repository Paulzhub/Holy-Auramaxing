-- Security review 1, finding SR-1 (D-050): two-step sign-in can't be
-- brute-forced around the app.
--
-- Supabase Auth's own /factors/:id/verify endpoint marks a session aal2
-- whenever the right code arrives, and it allows far more guesses than the
-- app's 5 per 15 minutes (hosted: 15 requests a minute per IP address,
-- unlimited across addresses). Someone holding only the password could guess
-- there directly. So aal2 alone no longer opens anything: the session must
-- also have been verified through the app's own rate-limited code step, which
-- records it with public.mark_session_mfa_verified() (secret key only).
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

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
create function pg_temp.as_session(uid uuid, sid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', aal)::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.as_server() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select set_config('role', 'service_role', true);
$$;

-- Ruth uses an authenticator app. Someone has her password and guessed a code
-- straight against Supabase Auth: Auth upgraded that session to aal2.
select pg_temp.make_user('00000000-0000-7000-8000-000000000d01', 'ruth@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000d02', 'boaz@example.test');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-7000-8000-00000000fd01', '00000000-0000-7000-8000-000000000d01', 'app', 'totp', 'verified',
        now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('00000000-0000-7000-8000-00000000cd01', '00000000-0000-7000-8000-000000000d01', now(), now(), 'aal2'),
       ('00000000-0000-7000-8000-00000000cd02', '00000000-0000-7000-8000-000000000d01', now(), now(), 'aal1'),
       ('00000000-0000-7000-8000-00000000cd03', '00000000-0000-7000-8000-000000000d02', now(), now(), 'aal2');

select pg_temp.as_session('00000000-0000-7000-8000-000000000d01', '00000000-0000-7000-8000-00000000cd01', 'aal2');
select is(util.session_ok(), false, 'An aal2 session that skipped the app''s code step fails the gate');
select is((select count(*) from public.profiles), 0::bigint, '... and reads nothing');
select is((select mfa_pending from public.auth_gate()), true, '... and is sent to the code step');
select throws_ok($$ select public.replace_recovery_codes(array(select lpad(to_hex(i), 64, '0')
                                                            from generate_series(1, 10) as i)) $$,
  '42501', 'aal2_required', '... and cannot mint recovery codes');

select throws_ok(
  $$ select public.mark_session_mfa_verified('00000000-0000-7000-8000-000000000d01',
                                             '00000000-0000-7000-8000-00000000cd01') $$,
  '42501', null, 'Signed-in people cannot mark their own session');

-- The app's server, after its own rate-limited code check, records it.
select pg_temp.as_server();
select is(public.mark_session_mfa_verified('00000000-0000-7000-8000-000000000d01',
                                            '00000000-0000-7000-8000-00000000cd02'), false,
  'The server cannot mark a session Auth has not upgraded to aal2');
select is(public.mark_session_mfa_verified('00000000-0000-7000-8000-000000000d01',
                                            '00000000-0000-7000-8000-00000000cd03'), false,
  '... nor another person''s session');
select is(public.mark_session_mfa_verified('00000000-0000-7000-8000-000000000d01',
                                            '00000000-0000-7000-8000-00000000cd01'), true,
  'It marks Ruth''s own aal2 session');

select pg_temp.as_session('00000000-0000-7000-8000-000000000d01', '00000000-0000-7000-8000-00000000cd01', 'aal2');
select is(util.session_ok(), true, 'Verified through the app, the session passes the gate');
select is((select count(*) from public.profiles), 1::bigint, '... and reads her profile');
select is((select mfa_pending from public.auth_gate()), false, '... and is not asked for a code again');

-- Signing out removes the session and its mark with it.
select pg_temp.as_postgres();
delete from auth.sessions where id = '00000000-0000-7000-8000-00000000cd01';
select is((select count(*) from private.mfa_verified_sessions
            where session_id = '00000000-0000-7000-8000-00000000cd01'), 0::bigint,
  'A signed-out session''s mark goes with it');

-- People without an authenticator app are unaffected.
select pg_temp.as_session('00000000-0000-7000-8000-000000000d02', '00000000-0000-7000-8000-00000000cd03', 'aal2');
select is(util.session_ok(), true, 'Without a verified factor, no mark is needed');
select is((select mfa_pending from public.auth_gate()), false, '... and no code is asked for');

select * from finish();
rollback;
