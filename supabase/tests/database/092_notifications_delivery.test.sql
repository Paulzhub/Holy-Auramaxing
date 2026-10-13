-- Phase 7c: sending push and email (CLAUDE.md §7.8; D-092). Devices are
-- saved by their owner only; the sender (secret key only) claims ready
-- deliveries once each, gets names only where the recipient may see them,
-- records results, and dead subscriptions (404/410) go at once. One-click
-- unsubscribe turns off one type's email. pg_net is asked only when
-- something is waiting and the sender is configured.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(32);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'UTC', onboarded_at = now(), display_name = initcap(split_part(email, '@', 1))
   where profiles.id = make_user.id;
  update public.notification_settings set quiet_hours_start = '00:00', quiet_hours_end = '00:00'
   where user_id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select set_config('role', 'service_role', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'postgres', true);
$$;

\set a '''00000000-0000-7000-8000-000000009201'''
\set b '''00000000-0000-7000-8000-000000009202'''
\set c '''00000000-0000-7000-8000-000000009203'''
select pg_temp.make_user(:a, 'anna@example.test');
select pg_temp.make_user(:b, 'ben@example.test');
select pg_temp.make_user(:c, 'cara@example.test');

-- ---------------------------------------------------------------- devices

select pg_temp.as_user(:a);
select lives_ok($$select public.save_push_subscription('https://push.example.test/a1', 'BAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAA', 'Chrome on Android')$$,
  'Saving this browser''s push subscription');
select is((select count(*) from public.push_subscriptions), 1::bigint, '... I see my device');
select is((select user_agent from public.push_subscriptions), 'Chrome on Android', '... by its label');
select throws_ok($$select public.save_push_subscription('http://push.example.test/x', 'BAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAA', null)$$,
  '22023', null, 'Only https push services');
select throws_ok($$select public.notify_claim(10)$$, '42501', null, 'Members can''t claim deliveries');
select throws_ok($$select public.notify_unsubscribe('00000000-0000-7000-8000-000000009202', 'announcement')$$,
  '42501', null, '... nor unsubscribe anyone');
select throws_ok($$select public.notify_configure('http://x.test/api/notify/deliver', repeat('s', 40))$$,
  '42501', null, '... nor point the sender anywhere');
select pg_temp.as_user(:b);
select is((select count(*) from public.push_subscriptions), 0::bigint, 'Nobody else sees my devices');
-- The same browser, now signed in as b: the endpoint moves to b.
select public.save_push_subscription('https://push.example.test/a1', 'BAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAA', 'Chrome on Android');
select pg_temp.as_postgres();
select is((select user_id from public.push_subscriptions where endpoint = 'https://push.example.test/a1'), :b::uuid,
  'An endpoint belongs to one browser: it moves to whoever saved it last');
select pg_temp.as_user(:b);
select public.save_push_subscription('https://push.example.test/b' || i, 'BAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAA', null)
  from generate_series(1, 11) i;
select is((select count(*) from public.push_subscriptions), 10::bigint, 'At most 10 devices; the oldest goes');
select pg_temp.as_postgres();
select set_config('test.endpoint', (select endpoint from public.push_subscriptions where user_id = :b limit 1), true);
select pg_temp.as_user(:b);
select is(public.remove_push_subscription(p_endpoint => current_setting('test.endpoint')), 1, 'Removing this browser''s');
select pg_temp.as_postgres();

-- ---------------------------------------------------------------- claiming and finishing

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (:a, 'https://push.example.test/a2', 'k', 'a');
select private.deliver(array[:a]::uuid[], 'nudge', null, :b, '{"kind":"praying"}'::jsonb, 'claim:1');
insert into public.notification_preferences (user_id, type, channel, enabled) values (:a, 'announcement', 'email', true);
select private.deliver(array[:a]::uuid[], 'announcement', null, :b, '{}'::jsonb, 'claim:2');
select pg_temp.as_service();
create temp table claimed as select * from public.notify_claim(50);
select pg_temp.as_postgres();
select is((select count(*) from claimed), 3::bigint, 'The sender claims every ready delivery (push, push, email)');
select is((select count(*) from private.notification_deliveries where status = 'sending'), 3::bigint, '... marked sending');
select is((select email from claimed where channel = 'email'), 'anna@example.test', 'Email gets the address');
select is((select count(*) from claimed where channel = 'push' and email is not null), 0::bigint, '... push never does');
select is((select jsonb_array_length(devices) from claimed where channel = 'push' limit 1), 1, 'Push gets the devices');
select is((select discreet from claimed limit 1), true, 'Discreet mode is on by default');
-- Names only where the recipient could see the profile.
select is((select actor_name from claimed where type = 'nudge'), null, 'No name when the profile isn''t visible to them');
select pg_temp.as_service();
select is((select count(*) from public.notify_claim(50)), 0::bigint, 'Claimed deliveries aren''t claimed twice');
select pg_temp.as_postgres();
update private.notification_deliveries set claimed_at = now() - interval '3 minutes' where status = 'sending';
select pg_temp.as_service();
select is((select count(*) from public.notify_claim(50)), 3::bigint, '... unless a sender died: after two minutes they come back');
select is(public.notify_finish(jsonb_build_array(
  jsonb_build_object('id', (select delivery_id from claimed where type = 'nudge' and channel = 'push'), 'status', 'sent',
                     'used', jsonb_build_array('https://push.example.test/a2')),
  jsonb_build_object('id', (select delivery_id from claimed where type = 'announcement' and channel = 'push'),
                     'status', 'retry', 'reason', 'push_error', 'gone', jsonb_build_array('https://push.example.test/a2')),
  jsonb_build_object('id', (select delivery_id from claimed where channel = 'email'), 'status', 'failed', 'reason', 'no_address')
)), 3, 'Recording three results');
select pg_temp.as_postgres();
select is((select status from private.notification_deliveries where id = (select delivery_id from claimed where type = 'nudge' and channel = 'push')),
  'sent', 'Sent');
select is((select status from private.notification_deliveries where id = (select delivery_id from claimed where type = 'announcement' and channel = 'push')),
  'ready', 'A retry is ready again');
select is((select status || ':' || reason from private.notification_deliveries where id = (select delivery_id from claimed where channel = 'email')),
  'failed:no_address', 'A failure is kept with its reason');
select is((select count(*) from public.push_subscriptions where endpoint = 'https://push.example.test/a2'), 0::bigint,
  'A subscription the push service called gone (404/410) is deleted at once');
update private.notification_deliveries set attempts = 5, status = 'sending' where id = (select delivery_id from claimed where type = 'announcement' and channel = 'push');
select pg_temp.as_service();
select public.notify_finish(jsonb_build_array(jsonb_build_object(
  'id', (select delivery_id from claimed where type = 'announcement' and channel = 'push'), 'status', 'retry')));
select pg_temp.as_postgres();
select is((select status from private.notification_deliveries where id = (select delivery_id from claimed where type = 'announcement' and channel = 'push')),
  'failed', 'After five tries, it gives up');

-- ---------------------------------------------------------------- unsubscribe, closing, pg_net

select pg_temp.as_service();
select is(public.notify_unsubscribe(:a, 'announcement'), true, 'One-click unsubscribe');
select is(public.notify_unsubscribe(:a, 'security'), false, '... except security alerts');
select pg_temp.as_postgres();
select is((select count(*) from public.notification_preferences where user_id = :a and type = 'announcement' and channel = 'email'),
  0::bigint, '... back to the default: no email for announcements');

update public.profiles set deletion_requested_at = now() where id = :b;
select is((select count(*) from public.push_subscriptions where user_id = :b), 0::bigint,
  'Closing an account stops push on every device');

select is(private.kick_sender(), null::bigint, 'pg_net isn''t asked while the sender isn''t configured');
select pg_temp.as_service();
select public.notify_configure('http://host.docker.internal:3000/api/notify/deliver', repeat('s', 40));
select pg_temp.as_postgres();
select private.deliver(array[:c]::uuid[], 'security', null, null, '{"what":"new_login"}'::jsonb, null);
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (:c, 'https://push.example.test/c1', 'k', 'a');
select private.deliver(array[:c]::uuid[], 'security', null, null, '{"what":"new_login"}'::jsonb, null);
select ok(private.kick_sender() is not null, 'Something ready and configured: pg_net is asked to call the sender');

select * from finish();
rollback;
