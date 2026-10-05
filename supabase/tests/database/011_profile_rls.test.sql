begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

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

select pg_temp.make_user('00000000-0000-7000-8000-0000000000a1', 'rls-a@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-0000000000b1', 'rls-b@example.test');

-- Give B some private content to try to read.
update public.profiles
   set display_name = 'Bee', bio = 'B bio', testimony = 'B testimony', favourite_verse = 'Psalm 23'
 where id = '00000000-0000-7000-8000-0000000000b1';

create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;

-- ---------------------------------------------------------------- as A
select pg_temp.as_user('00000000-0000-7000-8000-0000000000a1');

select is((select count(*) from public.profiles), 1::bigint, 'A sees exactly one profile row');
select is((select id from public.profiles), '00000000-0000-7000-8000-0000000000a1'::uuid, 'and it is A''s own');
select is_empty($$ select bio, testimony from public.profiles where id = '00000000-0000-7000-8000-0000000000b1' $$,
  'A cannot read B''s profile row');
select is_empty($$ select * from public.privacy_settings where user_id = '00000000-0000-7000-8000-0000000000b1' $$,
  'A cannot read B''s privacy settings');
select is_empty($$ select * from public.consents where user_id = '00000000-0000-7000-8000-0000000000b1' $$,
  'A cannot read B''s consents');
select is((select count(*) from public.consents), 2::bigint, 'A can read their own two consents');

-- Writes against B affect nothing.
select is_empty($$ update public.profiles set bio = 'hacked' where id = '00000000-0000-7000-8000-0000000000b1' returning id $$,
  'A cannot edit B''s bio');
select is_empty($$ update public.privacy_settings set profile_visibility = 'groups'
                   where user_id = '00000000-0000-7000-8000-0000000000b1' returning user_id $$,
  'A cannot edit B''s privacy settings');
select throws_ok($$ delete from public.profiles where id = '00000000-0000-7000-8000-0000000000b1' $$,
  '42501', null, 'A cannot delete profiles');
select throws_ok($$ insert into public.profiles (id, handle, adult_confirmed_at)
                   values ('00000000-0000-7000-8000-0000000000c1', 'sneaky', now()) $$,
  '42501', null, 'A cannot insert profiles');
select throws_ok($$ insert into public.consents (user_id, kind, policy_version)
                   values ('00000000-0000-7000-8000-0000000000a1', 'terms_privacy', 'forged') $$,
  '42501', null, 'A cannot forge consent records');
select throws_ok($$ select * from public.audit_log $$, '42501', null, 'A cannot read the audit log');

-- A's own editable fields work.
select lives_ok($$ update public.profiles set bio = 'Mine', display_name = 'Ay', favourite_verse = 'John 8:36'
                   where id = '00000000-0000-7000-8000-0000000000a1' $$,
  'A can edit their own bio, name and verse');
select lives_ok($$ update public.privacy_settings set testimony_visibility = 'nobody'
                   where user_id = '00000000-0000-7000-8000-0000000000a1' $$,
  'A can change their own privacy settings');

-- A's protected fields cannot be changed directly.
select throws_ok($$ update public.profiles set adult_confirmed_at = now() where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '42501', null, 'A cannot change their age confirmation');
select throws_ok($$ update public.profiles set deletion_requested_at = null where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '42501', null, 'A cannot change deletion status directly');
select throws_ok($$ update public.profiles set avatar_status = 'ready' where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '42501', null, 'A cannot mark an unscreened avatar as ready');
select throws_ok($$ update public.profiles set id = '00000000-0000-7000-8000-0000000000c1' where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '42501', null, 'A cannot change their profile id');

-- Field validation.
select throws_ok($$ update public.profiles set handle = 'admin' where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '23514', 'handle_reserved', 'reserved handles are refused');
select throws_ok($$ update public.profiles set handle = 'Has Spaces' where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '23514', null, 'handles must be lower-case letters, digits or underscores');
select throws_ok($$ update public.profiles set bio = repeat('x', 281) where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '23514', null, 'bios are limited to 280 characters');
select throws_ok($$ update public.profiles set testimony = repeat('x', 2001) where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '23514', null, 'testimonies are limited to 2,000 characters');
select throws_ok($$ update public.profiles set timezone = 'Mars/Olympus' where id = '00000000-0000-7000-8000-0000000000a1' $$,
  '23514', 'timezone_invalid', 'unknown time zones are refused');

-- profile_cards with no shared group: A sees only their own card.
select is((select count(*) from public.profile_cards), 1::bigint, 'with no shared group, A sees only their own card');
select is_empty($$ select * from public.profile_cards where id = '00000000-0000-7000-8000-0000000000b1' $$,
  'B''s card is hidden from A');

-- ------------------------------------------- pretend A and B share a group
reset role;
create or replace function util.shares_group(viewer uuid, owner uuid) returns boolean
  language sql stable security definer set search_path = '' as $$ select true $$;
select pg_temp.as_user('00000000-0000-7000-8000-0000000000a1');

select is((select bio from public.profile_cards where id = '00000000-0000-7000-8000-0000000000b1'), 'B bio',
  'in a shared group, A sees B''s bio (visible to groups)');
select is((select testimony from public.profile_cards where id = '00000000-0000-7000-8000-0000000000b1'), null,
  'but not B''s testimony (partners only by default)');
select is_empty($$ select * from public.profiles where id = '00000000-0000-7000-8000-0000000000b1' $$,
  'and still cannot read B''s private profile row directly');

reset role;
update public.privacy_settings set verse_visibility = 'nobody' where user_id = '00000000-0000-7000-8000-0000000000b1';
select pg_temp.as_user('00000000-0000-7000-8000-0000000000a1');
select is((select favourite_verse from public.profile_cards where id = '00000000-0000-7000-8000-0000000000b1'), null,
  'a field set to nobody is hidden even from group members');

reset role;
update public.privacy_settings set profile_visibility = 'nobody' where user_id = '00000000-0000-7000-8000-0000000000b1';
select pg_temp.as_user('00000000-0000-7000-8000-0000000000a1');
select is_empty($$ select * from public.profile_cards where id = '00000000-0000-7000-8000-0000000000b1' $$,
  'a profile set to nobody is hidden entirely');

reset role;
update public.privacy_settings set profile_visibility = 'groups' where user_id = '00000000-0000-7000-8000-0000000000b1';
update public.profiles set deletion_requested_at = now() where id = '00000000-0000-7000-8000-0000000000b1';
select pg_temp.as_user('00000000-0000-7000-8000-0000000000a1');
select is_empty($$ select * from public.profile_cards where id = '00000000-0000-7000-8000-0000000000b1' $$,
  'an account scheduled for deletion disappears from cards');

-- ---------------------------------------------------------------- anon
reset role;
select pg_temp.as_anon();
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anonymous visitors cannot read profiles');
select throws_ok($$ select * from public.profile_cards $$, '42501', null, 'anonymous visitors cannot read profile cards');
select throws_ok($$ select * from public.privacy_settings $$, '42501', null, 'anonymous visitors cannot read privacy settings');

reset role;
select * from finish();
rollback;
