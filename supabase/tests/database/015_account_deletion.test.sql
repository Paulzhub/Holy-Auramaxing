begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

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

select pg_temp.make_user('00000000-0000-7000-8000-0000000000a5', 'del-a@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-0000000000b5', 'del-b@example.test');

-- A has two sessions (this device and a laptop), B has one.
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('00000000-0000-7000-8000-00000000a501', '00000000-0000-7000-8000-0000000000a5', now(), now(), 'aal1'),
  ('00000000-0000-7000-8000-00000000a502', '00000000-0000-7000-8000-0000000000a5', now(), now(), 'aal1'),
  ('00000000-0000-7000-8000-00000000b501', '00000000-0000-7000-8000-0000000000b5', now(), now(), 'aal1');

-- Something private for A, and security events for both.
insert into public.profile_private (user_id, my_why_encrypted)
values ('00000000-0000-7000-8000-0000000000a5', 'v1:aaaa:bbbb:cccc');
select util.audit('00000000-0000-7000-8000-0000000000a5', 'auth.sign_in', 'user', '00000000-0000-7000-8000-0000000000a5',
                  '{"device":"Chrome on Windows"}');
select util.audit('00000000-0000-7000-8000-0000000000b5', 'auth.sign_in', 'user', '00000000-0000-7000-8000-0000000000b5',
                  '{"device":"Safari on iOS"}');

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

-- ---------------------------------------------------------------- who may call what
select pg_temp.as_anon();
select throws_ok($$ select public.request_account_deletion() $$, '42501', null,
  'Signed-out visitors cannot request a deletion');
select throws_ok($$ select public.cancel_account_deletion() $$, '42501', null,
  'Signed-out visitors cannot cancel one');
select throws_ok($$ select * from public.my_audit_events() $$, '42501', null,
  'Signed-out visitors cannot read audit events');

select pg_temp.as_session('00000000-0000-7000-8000-0000000000a5', '00000000-0000-7000-8000-00000000a501', 'aal1');
select throws_ok($$ select public.run_account_purge() $$, '42501', null, 'Members cannot run the purge');
select throws_ok($$ select * from public.claim_storage_purges(10) $$, '42501', null,
  'Members cannot read the storage purge queue');
select throws_ok($$ select public.complete_storage_purge(util.uuid_v7()) $$, '42501', null,
  'Members cannot change the storage purge queue');
select throws_ok($$ update public.profiles set deletion_requested_at = now() - interval '30 days' $$, '42501', null,
  'Members cannot set (or back-date) deletion_requested_at directly');

-- ---------------------------------------------------------------- my_audit_events
select set_eq($$ select action, device from public.my_audit_events() $$,
  $$ values ('account.created'::text, null::text), ('auth.sign_in', 'Chrome on Windows') $$,
  'A sees only their own audit events, with the device label');

-- ---------------------------------------------------------------- request
select ok(public.request_account_deletion() between now() + interval '14 days' - interval '1 minute'
                                                and now() + interval '14 days' + interval '1 minute',
  'A request returns the erase date, 14 days away');
select isnt((select deletion_requested_at from public.profiles), null, 'The profile is marked');

select pg_temp.as_postgres();
select is((select count(*) from auth.sessions where user_id = '00000000-0000-7000-8000-0000000000a5'), 1::bigint,
  'A''s other device is signed out');
select is((select id from auth.sessions where user_id = '00000000-0000-7000-8000-0000000000a5'),
  '00000000-0000-7000-8000-00000000a501'::uuid, 'This device stays signed in');
select is((select count(*) from auth.sessions where user_id = '00000000-0000-7000-8000-0000000000b5'), 1::bigint,
  'B''s sessions are untouched');
select is((select count(*) from public.profile_cards where id = '00000000-0000-7000-8000-0000000000a5'), 0::bigint,
  'A''s profile card disappears at once');

-- Asking again keeps the original date.
update public.profiles set deletion_requested_at = now() - interval '3 days'
 where id = '00000000-0000-7000-8000-0000000000a5';
select pg_temp.as_session('00000000-0000-7000-8000-0000000000a5', '00000000-0000-7000-8000-00000000a501', 'aal1');
select ok(public.request_account_deletion() < now() + interval '12 days',
  'A second request does not push the date back');

-- ---------------------------------------------------------------- cancel
select pg_temp.as_session('00000000-0000-7000-8000-0000000000b5', '00000000-0000-7000-8000-00000000b501', 'aal1');
select is(public.cancel_account_deletion(), false, 'B has nothing to cancel');
select pg_temp.as_postgres();
select isnt((select deletion_requested_at from public.profiles where id = '00000000-0000-7000-8000-0000000000a5'), null,
  'B cannot cancel A''s request');

select pg_temp.as_session('00000000-0000-7000-8000-0000000000a5', '00000000-0000-7000-8000-00000000a501', 'aal1');
select is(public.cancel_account_deletion(), true, 'A keeps the account');
select is((select deletion_requested_at from public.profiles), null, 'The mark is gone');
select is(public.cancel_account_deletion(), false, 'Cancelling twice does nothing');

-- ---------------------------------------------------------------- two-step sign-in
select pg_temp.as_postgres();
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-7000-8000-00000000f501', '00000000-0000-7000-8000-0000000000b5', 'app', 'totp', 'verified', now(), now());
select pg_temp.as_session('00000000-0000-7000-8000-0000000000b5', '00000000-0000-7000-8000-00000000b501', 'aal1');
select throws_ok($$ select public.request_account_deletion() $$, '42501', null,
  'With two-step sign-in on, a session that hasn''t entered its code cannot request a deletion');
select is((select count(*) from public.my_audit_events()), 0::bigint,
  '... and reads no audit events');
select pg_temp.as_session('00000000-0000-7000-8000-0000000000b5', '00000000-0000-7000-8000-00000000b501', 'aal2');
select ok(public.request_account_deletion() is not null, 'At aal2 it can');

-- ---------------------------------------------------------------- the daily purge
-- A asked 15 days ago (due); B asked just now (not due).
select pg_temp.as_postgres();
update public.profiles set deletion_requested_at = now() - interval '15 days'
 where id = '00000000-0000-7000-8000-0000000000a5';

select pg_temp.as_service();
select is(public.run_account_purge(), 1, 'Only the account past its 14 days is erased');

select pg_temp.as_postgres();
select is((select count(*) from auth.users where id = '00000000-0000-7000-8000-0000000000a5'), 0::bigint,
  'A''s auth user is gone');
select is((select count(*) from public.profiles where id = '00000000-0000-7000-8000-0000000000a5'), 0::bigint,
  'A''s profile is gone');
select is((select count(*) from public.profile_private where user_id = '00000000-0000-7000-8000-0000000000a5')
        + (select count(*) from public.privacy_settings where user_id = '00000000-0000-7000-8000-0000000000a5')
        + (select count(*) from public.notification_settings where user_id = '00000000-0000-7000-8000-0000000000a5')
        + (select count(*) from public.consents where user_id = '00000000-0000-7000-8000-0000000000a5'),
  0::bigint, 'A''s private note, settings and consents are gone');
select is((select count(*) from auth.sessions where user_id = '00000000-0000-7000-8000-0000000000a5'), 0::bigint,
  'A''s sessions are gone');
select is((select count(*) from public.audit_log
            where actor_id = '00000000-0000-7000-8000-0000000000a5'
               or target_id = '00000000-0000-7000-8000-0000000000a5'), 0::bigint,
  'No audit row points at A any more');
select ok(exists (select 1 from public.audit_log where action = 'account.deleted' and actor_id is null and target_id is null),
  'An anonymous account.deleted event is recorded');
select is((select count(*) from public.profiles where id = '00000000-0000-7000-8000-0000000000b5'), 1::bigint,
  'B, still inside the grace period, is untouched');

-- ---------------------------------------------------------------- storage queue
select pg_temp.as_service();
select results_eq($$ select bucket, prefix from public.claim_storage_purges(10) $$,
  $$ values ('avatars'::text, '00000000-0000-7000-8000-0000000000a5'::text) $$,
  'A''s photo folder is queued for removal');
select is((select count(*) from public.claim_storage_purges(10)), 0::bigint,
  'A folder just claimed is not handed out again straight away');
select pg_temp.as_postgres();
update private.storage_purge_queue set last_attempt_at = now() - interval '11 minutes';
select pg_temp.as_service();
select lives_ok($$ select public.complete_storage_purge(id) from public.claim_storage_purges(10) $$,
  'A folder whose claim went stale is handed out again, and the server marks it done');

select pg_temp.as_postgres();
select is((select count(*) from private.storage_purge_queue), 0::bigint, 'The queue is empty');
select is((select count(*) from cron.job where jobname = 'account-deletion-daily'), 1::bigint,
  'The purge runs every day');

select * from finish();
rollback;
