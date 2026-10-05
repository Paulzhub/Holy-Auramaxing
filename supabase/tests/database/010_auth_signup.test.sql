begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- Helpers: issue a ticket for a known token, and insert an auth user the way
-- Supabase Auth does.
create function pg_temp.ticket(token text, ttl integer default 30) returns void language sql as $$
  select public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'Asia/Kolkata', ttl);
$$;
create function pg_temp.new_user(id uuid, email text, provider text, meta jsonb) returns void language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
          jsonb_build_object('provider', provider, 'providers', jsonb_build_array(provider)), meta, now(), now());
$$;

-- 1. Email sign-up without a ticket is refused: no account.
select throws_ok(
  $$ select pg_temp.new_user('00000000-0000-7000-8000-000000000001', 'pgtap-noticket@example.test', 'email', '{}') $$,
  '28000', 'signup_ticket_required',
  'email sign-up without a ticket (never passed the age gate) is refused'
);
select is((select count(*) from auth.users where email = 'pgtap-noticket@example.test'), 0::bigint, 'no auth user was created');

-- 2. A made-up token is refused.
select throws_ok(
  $$ select pg_temp.new_user('00000000-0000-7000-8000-000000000002', 'pgtap-fake@example.test', 'email',
       '{"signup_ticket":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}') $$,
  '28000', 'signup_ticket_invalid',
  'an unknown ticket is refused'
);

-- 3. A live ticket creates the account, the profile and both consents.
select pg_temp.ticket('token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
select lives_ok(
  $$ select pg_temp.new_user('00000000-0000-7000-8000-00000000000a', 'pgtap-a@example.test', 'email',
       '{"signup_ticket":"token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') $$,
  'a live ticket lets the sign-up through'
);
select ok(exists (select 1 from public.profiles where id = '00000000-0000-7000-8000-00000000000a' and adult_confirmed_at is not null),
  'profile created with the 18+ confirmation');
select is((select timezone from public.profiles where id = '00000000-0000-7000-8000-00000000000a'), 'Asia/Kolkata',
  'time zone from the sign-up form is kept');
select ok((select handle from public.profiles where id = '00000000-0000-7000-8000-00000000000a') ~ '^friend_[a-z0-9]{6}$',
  'a random starting handle is assigned');
select is((select count(*) from public.privacy_settings where user_id = '00000000-0000-7000-8000-00000000000a'), 1::bigint,
  'default privacy settings created');
select bag_eq(
  $$ select kind, policy_version from public.consents where user_id = '00000000-0000-7000-8000-00000000000a' $$,
  $$ values ('terms_privacy', 'test-v1'), ('sensitive_data', 'test-v1') $$,
  'both consents recorded with the policy version'
);
select ok(not ((select raw_user_meta_data from auth.users where id = '00000000-0000-7000-8000-00000000000a') ? 'signup_ticket'),
  'the token is not kept in user metadata');
select ok(not ((select raw_app_meta_data from auth.users where id = '00000000-0000-7000-8000-00000000000a') ? 'signup_ticket_id'),
  'the ticket marker is removed from app metadata');
select is((select count(*) from public.audit_log where actor_id = '00000000-0000-7000-8000-00000000000a' and action = 'account.created'),
  1::bigint, 'account creation is audited');

-- 4. Tickets are single-use.
select throws_ok(
  $$ select pg_temp.new_user('00000000-0000-7000-8000-000000000003', 'pgtap-again@example.test', 'email',
       '{"signup_ticket":"token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') $$,
  '28000', 'signup_ticket_invalid',
  'a used ticket cannot create a second account'
);

-- 5. Expired tickets are refused.
select pg_temp.ticket('token-expiredxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 1);
update private.signup_tickets set expires_at = now() - interval '1 second'
 where token_hash = encode(extensions.digest('token-expiredxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'sha256'), 'hex');
select throws_ok(
  $$ select pg_temp.new_user('00000000-0000-7000-8000-000000000004', 'pgtap-late@example.test', 'email',
       '{"signup_ticket":"token-expiredxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}') $$,
  '28000', 'signup_ticket_invalid',
  'an expired ticket is refused'
);

-- 6. Google: the auth user exists briefly, but no profile until a ticket is claimed.
select pg_temp.new_user('00000000-0000-7000-8000-00000000000b', 'pgtap-g@example.test', 'google', '{"full_name":"G"}');
select ok(not exists (select 1 from public.profiles where id = '00000000-0000-7000-8000-00000000000b'),
  'a Google sign-in without a ticket gets no profile');
select ok(not public.complete_oauth_signup('00000000-0000-7000-8000-00000000000b', 'token-wrongxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
  'completing a Google sign-up with a wrong ticket fails');
select pg_temp.ticket('token-googlexxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
select ok(public.complete_oauth_signup('00000000-0000-7000-8000-00000000000b', 'token-googlexxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
  'completing a Google sign-up with a live ticket succeeds');
select is((select count(*) from public.consents where user_id = '00000000-0000-7000-8000-00000000000b'), 2::bigint,
  'Google sign-up records both consents');

-- 7. Hourly maintenance removes auth users that never finished sign-up.
select pg_temp.new_user('00000000-0000-7000-8000-00000000000c', 'pgtap-orphan@example.test', 'google', '{}');
update auth.users set created_at = now() - interval '2 hours' where id = '00000000-0000-7000-8000-00000000000c';
select private.hourly_auth_maintenance();
select is((select count(*) from auth.users where id = '00000000-0000-7000-8000-00000000000c'), 0::bigint,
  'an auth user with no profile after an hour is removed');
select is((select count(*) from auth.users where id = '00000000-0000-7000-8000-00000000000a'), 1::bigint,
  'completed accounts are untouched by maintenance');

-- 8. The API roles cannot mint tickets or finish sign-ups themselves.
select ok(not has_function_privilege('anon', 'public.create_signup_ticket(text, text, text, integer)', 'execute'),
  'anon cannot create sign-up tickets');
select ok(not has_function_privilege('authenticated', 'public.complete_oauth_signup(uuid, text)', 'execute'),
  'signed-in users cannot complete sign-ups for anyone');

select * from finish();
rollback;
