begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select pg_temp.make_user('00000000-0000-7000-8000-0000000000a2', 'onb-a@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-0000000000b2', 'onb-b@example.test');

select is((select discreet_mode from public.notification_settings where user_id = '00000000-0000-7000-8000-0000000000a2'),
  true, 'new accounts get notification settings with discreet mode on');
select is((select reminder_time from public.notification_settings where user_id = '00000000-0000-7000-8000-0000000000a2'),
  null, 'no reminder until the user picks a time');

insert into public.profile_private (user_id, my_why_encrypted)
values ('00000000-0000-7000-8000-0000000000b2', 'v1:aaaa:bbbb:cccc');

-- ------------------------------------------------------------ as A
select pg_temp.as_user('00000000-0000-7000-8000-0000000000a2');

select lives_ok($$ insert into public.profile_private (user_id, my_why_encrypted)
                   values ('00000000-0000-7000-8000-0000000000a2', 'v1:aaaa:bbbb:cccc') $$,
  'A can save their own "my why"');
select throws_ok($$ insert into public.profile_private (user_id, my_why_encrypted)
                    values ('00000000-0000-7000-8000-0000000000a2', 'my secret reason in plain text') $$,
  '23514', null, 'plaintext is refused: only the encrypted format is stored');
select is_empty($$ select * from public.profile_private where user_id = '00000000-0000-7000-8000-0000000000b2' $$,
  'A cannot read B''s "my why"');
select is_empty($$ update public.profile_private set my_why_encrypted = 'v1:x:y:z'
                   where user_id = '00000000-0000-7000-8000-0000000000b2' returning user_id $$,
  'A cannot overwrite B''s "my why"');
select throws_ok($$ insert into public.profile_private (user_id, my_why_encrypted)
                    values ('00000000-0000-7000-8000-0000000000b2', 'v1:aaaa:bbbb:cccc') $$,
  '42501', null, 'A cannot write a "my why" for B');

select is_empty($$ select * from public.notification_settings where user_id = '00000000-0000-7000-8000-0000000000b2' $$,
  'A cannot read B''s notification settings');
select is_empty($$ update public.notification_settings set discreet_mode = false
                   where user_id = '00000000-0000-7000-8000-0000000000b2' returning user_id $$,
  'A cannot change B''s notification settings');
select lives_ok($$ update public.notification_settings set reminder_time = '21:30', discreet_mode = false
                   where user_id = '00000000-0000-7000-8000-0000000000a2' $$,
  'A can change their own reminder time and discreet mode');
select throws_ok($$ update public.profiles set onboarded_at = now() where id = '00000000-0000-7000-8000-0000000000a2' $$,
  '42501', null, 'onboarded_at cannot be set directly');

select lives_ok($$ select public.complete_onboarding() $$, 'A can finish onboarding');
reset role;
select ok((select onboarded_at from public.profiles where id = '00000000-0000-7000-8000-0000000000a2') is not null,
  'complete_onboarding marks A as onboarded');
select ok((select onboarded_at from public.profiles where id = '00000000-0000-7000-8000-0000000000b2') is null,
  'and only A');

-- ------------------------------------------------------------ anon
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.profile_private $$, '42501', null, 'anonymous visitors cannot read "my why"');
select throws_ok($$ select public.complete_onboarding() $$, '42501', null, 'anonymous visitors cannot call complete_onboarding');

reset role;
select * from finish();
rollback;
