-- Security review 2 (D-094, D-096, D-097).
-- SR2-2: a push subscription may only point at a real browser push service,
--   so the sender can't be made to POST to any address an attacker chooses
--   (a home router, a cloud metadata service, another site).
-- SR2-4: live-update pings go out on private Realtime channels that browsers
--   may listen to but never send on, so nobody who learns a channel's name
--   can fake pings to every member's open page.
-- SR2-5: muting nudges stops the ones still waiting in the queue too.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(18);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'UTC', onboarded_at = now() where profiles.id = make_user.id;
  update public.notification_settings set quiet_hours_start = '00:00', quiet_hours_end = '00:00'
   where user_id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select set_config('role', 'anon', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.set(k text, v text) returns void language sql as $$ select set_config('test.' || k, v, true) $$;
create function pg_temp.get(k text) returns text language sql as $$ select current_setting('test.' || k) $$;
create function pg_temp.save(endpoint text) returns void language sql as $$
  select public.save_push_subscription(endpoint, 'BAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAA', null);
$$;

\set a '''00000000-0000-7000-8000-000000009301'''
\set b '''00000000-0000-7000-8000-000000009302'''
select pg_temp.make_user(:a, 'hard-anna@example.test');
select pg_temp.make_user(:b, 'hard-ben@example.test');

-- ---------------------------------------------------------------- SR2-2: push services only

select pg_temp.as_user(:a);
select throws_ok($$ select pg_temp.save('https://192.168.1.1:8443/admin/reboot') $$,
  '22023', 'invalid_input', 'SR2-2: an address on a home network is refused');
select throws_ok($$ select pg_temp.save('https://169.254.169.254.nip.io/latest/meta-data') $$,
  '22023', 'invalid_input', 'SR2-2: ... and any host that isn''t a push service');
select throws_ok($$ select pg_temp.save('https://fcm.googleapis.com.attacker.test/fcm/send/x') $$,
  '22023', 'invalid_input', 'SR2-2: ... including a look-alike host');
select throws_ok($$ select pg_temp.save('https://fcm.googleapis.com:8443/fcm/send/x') $$,
  '22023', 'invalid_input', 'SR2-2: ... a push service on another port');
select throws_ok($$ select pg_temp.save('https://someone@fcm.googleapis.com/fcm/send/x') $$,
  '22023', 'invalid_input', 'SR2-2: ... or with a user name in front');
select lives_ok($$ select pg_temp.save('https://fcm.googleapis.com/fcm/send/dGVzdC1hbm5h:APA91bTest') $$,
  'Chrome, Edge on Android, Samsung and Opera (FCM) are accepted');
select lives_ok($$ select pg_temp.save('https://updates.push.services.mozilla.com/wpush/v2/gAAAAABtest') $$,
  'Firefox is accepted');
select lives_ok($$ select pg_temp.save('https://web.push.apple.com/QGuQyavXutnMH3IAABtest') $$,
  'Safari is accepted');
select lives_ok($$ select pg_temp.save('https://wns2-par02p.notify.windows.com/w/?token=BQYAAABtest') $$,
  'Edge on Windows is accepted');
select pg_temp.as_postgres();
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                    values ('00000000-0000-7000-8000-000000009302', 'https://10.0.0.1/x', 'k', 'a') $$,
  '23514', null, 'SR2-2: the table itself refuses any other address');

-- ---------------------------------------------------------------- SR2-4: listen-only live channels

select pg_temp.as_user(:a);
select pg_temp.set('g', public.create_group('Live group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'A covenant.', 'checkin_only', true, 'full')::text);
select pg_temp.set('topic', public.group_live_topic(pg_temp.get('g')::uuid));
select pg_temp.set('mine', public.my_live_topic());
select pg_temp.as_postgres();
delete from realtime.messages where topic in (pg_temp.get('topic'), pg_temp.get('mine'));
select pg_temp.as_user(:a);
select public.create_post(pg_temp.get('g')::uuid, 'encouragement', 'Hello, everyone');
select pg_temp.as_postgres();
select private.ping_user(:a);
select is((select bool_and(private) from realtime.messages where topic = pg_temp.get('topic')), true,
  'SR2-4: a group''s pings go out on a private channel');
select is((select bool_and(private) from realtime.messages where topic = pg_temp.get('mine')), true,
  'SR2-4: ... and so do a person''s own');

-- Browsers connect with the publishable key only (no session token, D-086), as anon.
select pg_temp.as_anon();
select set_config('realtime.topic', pg_temp.get('topic'), true);
select ok((select count(*) from realtime.messages where topic = pg_temp.get('topic')) >= 1,
  'SR2-4: a browser that knows the channel''s name may listen to it');
select throws_ok(format($$ insert into realtime.messages (topic, extension, event, payload, private)
                           values (%L, 'broadcast', 'changed', '{"what":"wall"}', true) $$, pg_temp.get('topic')),
  '42501', null, 'SR2-4: but can never send on it');
select set_config('realtime.topic', 'room:anything', true);
select is((select count(*) from realtime.messages where topic = 'room:anything'), 0::bigint,
  'SR2-4: channels that aren''t ours stay closed');
select pg_temp.as_user(:b);
select set_config('realtime.topic', pg_temp.get('topic'), true);
select throws_ok(format($$ insert into realtime.messages (topic, extension, event, payload, private)
                           values (%L, 'broadcast', 'changed', '{"what":"wall"}', true) $$, pg_temp.get('topic')),
  '42501', null, 'SR2-4: ... nor can a signed-in token');

-- ---------------------------------------------------------------- SR2-5: muting stops queued nudges

select pg_temp.as_postgres();
insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
values (pg_temp.get('g')::uuid, :b, 'member', 'active', 'full', now(), now());
select private.run_notify(1000, true);
select pg_temp.as_user(:a);
select public.send_nudge(pg_temp.get('g')::uuid, :b, 'praying');
-- b mutes nudges before the worker gets to it.
select pg_temp.as_user(:b);
update public.privacy_settings set nudges_muted = true where user_id = auth.uid();
select pg_temp.as_postgres();
select private.run_notify(1000, true);
select is((select count(*) from public.notifications where user_id = :b::uuid and type = 'nudge'), 0::bigint,
  'SR2-5: a nudge still queued when its recipient mutes nudges isn''t delivered');
-- And the same for a mute in just that group.
update public.privacy_settings set nudges_muted = false where user_id = :b::uuid;
delete from public.nudges;
select pg_temp.as_user(:a);
select public.send_nudge(pg_temp.get('g')::uuid, :b, 'got_this');
select pg_temp.as_user(:b);
select public.set_group_nudges_muted(pg_temp.get('g')::uuid, true);
select pg_temp.as_postgres();
select private.run_notify(1000, true);
select is((select count(*) from public.notifications where user_id = :b::uuid and type = 'nudge'), 0::bigint,
  'SR2-5: ... nor when they mute nudges in that group');

select * from finish();
rollback;
