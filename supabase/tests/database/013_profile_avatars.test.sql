begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
end;
$$;

select pg_temp.make_user('00000000-0000-7000-8000-0000000003a1', 'pgtap-avatar-a@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-0000000003b1', 'pgtap-avatar-b@example.test');

create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;

-- --------------------------------------------------------- the bucket
select is((select public from storage.buckets where id = 'avatars'), false, 'the avatars bucket is private');
select is((select allowed_mime_types from storage.buckets where id = 'avatars'), array['image/webp'],
  'the avatars bucket accepts only WebP (the server re-encodes everything)');

-- The server (service role) stores B's photo and makes it live.
insert into storage.objects (bucket_id, name, owner_id)
values ('avatars', '00000000-0000-7000-8000-0000000003b1/bbbbbbbbbbbbbbbbbbbbbb-256.webp', null);
update public.profiles
   set avatar_path = '00000000-0000-7000-8000-0000000003b1/bbbbbbbbbbbbbbbbbbbbbb',
       avatar_status = 'ready'
 where id = '00000000-0000-7000-8000-0000000003b1';

-- ------------------------------------------------------------- paths
select throws_ok($$ update public.profiles set avatar_path = '00000000-0000-7000-8000-0000000003b1/bbbbbbbbbbbbbbbbbbbbbb'
                   where id = '00000000-0000-7000-8000-0000000003a1' $$,
  '23514', null, 'an avatar path must sit in the owner''s own folder');
select throws_ok($$ update public.profiles set avatar_pending_path = '00000000-0000-7000-8000-0000000003a1/../x'
                   where id = '00000000-0000-7000-8000-0000000003a1' $$,
  '23514', null, 'an avatar path cannot contain dots or slashes');
select throws_ok($$ update public.profiles set avatar_status = 'processing'
                   where id = '00000000-0000-7000-8000-0000000003a1' $$,
  '23514', null, 'avatar_status accepts only none, pending_review, ready or rejected');

-- ---------------------------------------------------------------- as A
select pg_temp.as_user('00000000-0000-7000-8000-0000000003a1');

select is_empty($$ select name from storage.objects where bucket_id = 'avatars' $$,
  'A cannot list or read any avatar file, not even B''s');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                   values ('avatars', '00000000-0000-7000-8000-0000000003a1/aaaaaaaaaaaaaaaaaaaaaa-256.webp') $$,
  '42501', null, 'A cannot upload straight to storage (the server must check the photo first)');
select is_empty($$ update storage.objects set name = 'x' where bucket_id = 'avatars' returning id $$,
  'A cannot rename avatar files');
-- Storage refuses direct deletes for every API role; files go only through the server.
select throws_ok($$ delete from storage.objects where bucket_id = 'avatars' $$,
  '42501', null, 'A cannot delete avatar files');

select throws_ok($$ update public.profiles set avatar_path = '00000000-0000-7000-8000-0000000003a1/aaaaaaaaaaaaaaaaaaaaaa'
                   where id = '00000000-0000-7000-8000-0000000003a1' $$,
  '42501', null, 'A cannot set their own live avatar (only the server can, after screening)');
select throws_ok($$ update public.profiles set avatar_pending_path = null
                   where id = '00000000-0000-7000-8000-0000000003a1' $$,
  '42501', null, 'A cannot change the pending avatar either');

-- No shared group yet (Phase 3), so B's card, and with it B's avatar path,
-- is invisible to A.
select is_empty($$ select avatar_path from public.profile_cards where id = '00000000-0000-7000-8000-0000000003b1' $$,
  'A cannot see B''s avatar path without sharing a group');

-- ---------------------------------------------------------------- as B
select pg_temp.as_user('00000000-0000-7000-8000-0000000003b1');
select is((select avatar_path from public.profile_cards where id = '00000000-0000-7000-8000-0000000003b1'),
  '00000000-0000-7000-8000-0000000003b1/bbbbbbbbbbbbbbbbbbbbbb', 'B sees their own live avatar on their card');
select is_empty($$ select name from storage.objects where bucket_id = 'avatars' $$,
  'B cannot read files directly either; avatars are served through the app');

-- ------------------------------------------------------------- as anon
select pg_temp.as_anon();
select is_empty($$ select name from storage.objects where bucket_id = 'avatars' $$,
  'visitors cannot read avatar files');
select throws_ok($$ select * from public.profile_cards $$, '42501', null, 'visitors cannot read profile cards');

reset role;
select is((select count(*) from storage.objects where bucket_id = 'avatars'
           and name = '00000000-0000-7000-8000-0000000003b1/bbbbbbbbbbbbbbbbbbbbbb-256.webp'), 1::bigint,
  'B''s avatar file is untouched after everyone else''s attempts');

select * from finish();
rollback;
