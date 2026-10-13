-- Phase 7b: the notification pipeline (CLAUDE.md §7.8; D-089, D-090).
-- Events queue a job; the worker writes notifications for the right people
-- (never the actor, a blocked pair, a closing account or a non-member),
-- deduplicated or folded; each channel is planned by the person's choices,
-- snooze, quiet hours, digest, group mute and the hourly limit; partner SOS
-- and security alerts go through regardless. RLS keeps each person's own.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(73);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, encrypted_password)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now(),
          'old-hash');
  update public.profiles set timezone = 'UTC', created_at = now() - interval '60 days', onboarded_at = now()
   where profiles.id = make_user.id;
  -- Quiet hours off by default here, so each test sets what it needs.
  update public.notification_settings set quiet_hours_start = '00:00', quiet_hours_end = '00:00'
   where user_id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.g() returns uuid language sql as $$ select current_setting('test.g')::uuid $$;
create function pg_temp.add_member(uid uuid, share text default 'full', role text default 'member',
                                   status text default 'active') returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (pg_temp.g(), uid, role, status, share, now(), now() - interval '30 days');
$$;
create function pg_temp.work() returns integer language sql as $$ select private.run_notify(1000, true) $$;
create function pg_temp.count_for(uid uuid, t text) returns bigint language sql as $$
  select count(*) from public.notifications where user_id = uid and type = t
$$;
create function pg_temp.delivery(uid uuid, t text, ch text) returns text language sql as $$
  select d.status || coalesce(':' || d.reason, '')
    from private.notification_deliveries d join public.notifications n on n.id = d.notification_id
   where n.user_id = uid and n.type = t and d.channel = ch order by d.created_at desc limit 1
$$;
create function pg_temp.device(uid uuid) returns void language sql as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (uid, 'https://push.example.test/' || uid, 'key', 'auth');
$$;
create function pg_temp.post(author uuid, k text) returns uuid language sql as $$
  insert into public.posts (group_id, author_id, kind, body) values (pg_temp.g(), author, k, 'Words.') returning id
$$;

\set o '''00000000-0000-7000-8000-000000009001'''
\set a '''00000000-0000-7000-8000-000000009002'''
\set b '''00000000-0000-7000-8000-000000009003'''
\set c '''00000000-0000-7000-8000-000000009004'''
\set z '''00000000-0000-7000-8000-000000009005'''
\set p '''00000000-0000-7000-8000-000000009006'''
\set n '''00000000-0000-7000-8000-000000009007'''
select pg_temp.make_user(:o, 'nt-owner@example.test');
select pg_temp.make_user(:a, 'nt-a@example.test');
select pg_temp.make_user(:b, 'nt-b@example.test');
select pg_temp.make_user(:c, 'nt-c@example.test');
select pg_temp.make_user(:z, 'nt-closing@example.test');
select pg_temp.make_user(:p, 'nt-pending@example.test');
select pg_temp.make_user(:n, 'nt-outsider@example.test');

select pg_temp.as_user(:o);
select set_config('test.g', public.create_group('Notify group', null, 'ongoing', null, current_date, 'UTC', 50,
                  'invite_only', 'A covenant for the bell.', 'checkin_only', true, 'full')::text, true);
select pg_temp.as_postgres();
select pg_temp.add_member(:a);
select pg_temp.add_member(:b);
select pg_temp.add_member(:c);
select pg_temp.add_member(:z);
select pg_temp.add_member(:p, 'full', 'member', 'pending');
update public.profiles set deletion_requested_at = now() where id = :z;
select pg_temp.work();
delete from public.notifications;
delete from private.notification_deliveries;

-- ---------------------------------------------------------------- tables and RLS

select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.notifications'::regclass, 'public.notification_preferences'::regclass,
                            'public.push_subscriptions'::regclass, 'public.notification_types'::regclass)),
  'RLS is on for every notification table');
select ok(not has_table_privilege('anon', 'public.notifications', 'select'), 'anon reads no notifications');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'insert'),
  'Nobody writes notifications through the API');
select ok(not has_column_privilege('authenticated', 'public.push_subscriptions', 'endpoint', 'select'),
  'A device''s push endpoint and keys never leave the server');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'Deliveries live in the private schema');

-- ---------------------------------------------------------------- nudges

insert into public.nudges (group_id, from_user, to_user, kind, sender_day)
values (pg_temp.g(), :a, :b, 'pray_for_me', current_date);
select ok(pg_temp.work() >= 1, 'The worker takes the queued nudge');
select is(pg_temp.count_for(:b, 'nudge'), 1::bigint, 'A nudge notifies its recipient');
select is((select actor_id from public.notifications where user_id = :b and type = 'nudge'), :a::uuid,
  '... naming who sent it');
select is((select data ->> 'kind' from public.notifications where user_id = :b and type = 'nudge'), 'pray_for_me',
  '... and only its kind (a code, never text)');
select is(pg_temp.count_for(:a, 'nudge'), 0::bigint, 'The sender isn''t notified');
-- The same job again changes nothing.
select private.notify('nudge', jsonb_build_object('nudge', (select id from public.nudges where to_user = :b)));
select pg_temp.work();
select is(pg_temp.count_for(:b, 'nudge'), 1::bigint, 'The same event never notifies twice (dedupe)');

-- ---------------------------------------------------------------- reactions and prayer

select set_config('test.post', pg_temp.post(:b, 'encouragement')::text, true);
insert into public.reactions (group_id, user_id, target_type, target_id, kind)
values (pg_temp.g(), :a, 'post', current_setting('test.post')::uuid, 'heart'),
       (pg_temp.g(), :c, 'post', current_setting('test.post')::uuid, 'fire'),
       (pg_temp.g(), :b, 'post', current_setting('test.post')::uuid, 'dove');
select pg_temp.work();
select is(pg_temp.count_for(:b, 'reaction'), 1::bigint, 'Reactions on one post fold into one unread row');
select is((select fold_count from public.notifications where user_id = :b and type = 'reaction'), 2,
  '... counting two people (my own reaction doesn''t count)');

select set_config('test.prayer', pg_temp.post(:b, 'prayer_request')::text, true);
select pg_temp.work();
select is(pg_temp.count_for(:a, 'prayer_request'), 1::bigint, 'A prayer request notifies the group');
select is(pg_temp.count_for(:o, 'prayer_request'), 1::bigint, '... the owner too');
select is(pg_temp.count_for(:b, 'prayer_request'), 0::bigint, '... but not its author');
select is(pg_temp.count_for(:z, 'prayer_request'), 0::bigint, '... nor a closing account');
select is(pg_temp.count_for(:p, 'prayer_request'), 0::bigint, '... nor someone still waiting to be let in');
select is(pg_temp.count_for(:n, 'prayer_request'), 0::bigint, '... nor anyone outside the group');
insert into public.reactions (group_id, user_id, target_type, target_id, kind)
values (pg_temp.g(), :a, 'post', current_setting('test.prayer')::uuid, 'pray');
select pg_temp.work();
select is(pg_temp.count_for(:b, 'prayed_for_you'), 1::bigint, '"I prayed" on my prayer request is its own type');

-- ---------------------------------------------------------------- comments

insert into public.comments (post_id, group_id, author_id, body)
values (current_setting('test.post')::uuid, pg_temp.g(), :a, 'First.');
select pg_temp.work();
insert into public.comments (post_id, group_id, author_id, body)
values (current_setting('test.post')::uuid, pg_temp.g(), :c, 'Second.');
select pg_temp.work();
select is(pg_temp.count_for(:b, 'comment'), 1::bigint, 'Comments on my post fold into one unread row');
select is((select fold_count from public.notifications where user_id = :b and type = 'comment'), 2, '... of two');
select is((select data ->> 'reply' from public.notifications where user_id = :a and type = 'comment'), 'true',
  'An earlier commenter hears of the reply');
select is(pg_temp.count_for(:c, 'comment'), 0::bigint, 'The new commenter isn''t notified of their own comment');

-- ---------------------------------------------------------------- blocks

insert into public.blocks (blocker_id, blocked_id) values (:b, :c);
select is((select count(*) from public.notifications where user_id = :b and actor_id = :c), 0::bigint,
  'A block removes what each was told about the other');
insert into public.reactions (group_id, user_id, target_type, target_id, kind)
values (pg_temp.g(), :c, 'post', current_setting('test.prayer')::uuid, 'heart');
select pg_temp.work();
select is((select count(*) from public.notifications where user_id = :b and actor_id = :c), 0::bigint,
  '... and nothing new crosses it');
delete from public.blocks where blocker_id = :b;

-- ---------------------------------------------------------------- the people who lead

select pg_temp.add_member(:n, 'full', 'member', 'pending');
select pg_temp.work();
select is(pg_temp.count_for(:o, 'join_request'), 1::bigint, 'A request to join notifies the owner');
select is(pg_temp.count_for(:a, 'join_request'), 0::bigint, '... not plain members');
update public.group_members set status = 'active' where group_id = pg_temp.g() and user_id = :n;
select pg_temp.work();
select is(pg_temp.count_for(:o, 'member_joined'), 1::bigint, 'Someone joining notifies the owner and admins');
select is(pg_temp.count_for(:a, 'member_joined'), 0::bigint, '... not every member (owner, 2026-10-13)');

update public.group_members set role = 'admin' where group_id = pg_temp.g() and user_id = :a;
insert into public.reports (group_id, reporter_id, target_type, target_id, subject_id, reason)
values (pg_temp.g(), :c, 'post', current_setting('test.post')::uuid, :b, 'spam');
select pg_temp.work();
select is(pg_temp.count_for(:a, 'report'), 1::bigint, 'A report notifies the admins');
select is((select actor_id from public.notifications where user_id = :a and type = 'report'), null::uuid,
  '... never naming who reported (D-079)');
update public.group_members set role = 'member' where group_id = pg_temp.g() and user_id = :a;

-- ---------------------------------------------------------------- partners

insert into public.partnerships (group_id, user_a, user_b) values (pg_temp.g(), :a, :c);
select pg_temp.work();
select is((select data ->> 'what' from public.notifications where user_id = :c and type = 'partner_request'),
  'requested', 'A partner request notifies the person asked');
update public.partnerships set status = 'active', accepted_at = now() where user_a = :a and user_b = :c;
select pg_temp.work();
select is((select data ->> 'what' from public.notifications where user_id = :a and type = 'partner_request'),
  'accepted', '... and accepting notifies the one who asked');

-- ---------------------------------------------------------------- progress and security

insert into public.user_stats (user_id) values (:a), (:c) on conflict (user_id) do nothing;
update public.user_stats set level = level + 2 where user_id = :a;
update public.user_stats set level = 0 where user_id = :c;
select pg_temp.work();
select is(pg_temp.count_for(:a, 'level_up'), 1::bigint, 'A level up notifies only the person');
select is(pg_temp.count_for(:c, 'level_up'), 0::bigint, 'A level down notifies nobody (§7.6)');
insert into public.user_badges (user_id, badge) values (:a, 'free_1');
select pg_temp.work();
select is(pg_temp.count_for(:a, 'badge_earned'), 1::bigint, 'A badge notifies only the person');
select is(pg_temp.count_for(:o, 'badge_earned'), 0::bigint, '... not the group');

insert into private.known_devices (user_id, device_hash, label)
values (:a, repeat('a', 43), 'Chrome on Android');
select pg_temp.work();
select is(pg_temp.count_for(:a, 'security'), 0::bigint, 'The account''s first device sends no alert');
insert into private.known_devices (user_id, device_hash, label)
values (:a, repeat('b', 43), 'Safari on iPhone');
update auth.users set encrypted_password = 'new-hash' where id = :a;
select pg_temp.work();
select is(pg_temp.count_for(:a, 'security'), 2::bigint, 'A new device and a changed password both alert');

-- ---------------------------------------------------------------- reading as a person

select pg_temp.as_user(:a);
select is((select count(*) from public.notifications where user_id <> :a), 0::bigint,
  'RLS: I read only my own notifications');
select is((select count(*) from public.my_notifications()), (select count(*) from public.notifications),
  'my_notifications lists them');
select is((select sum(unread) from public.my_unread_counts())::bigint, (select count(*) from public.notifications),
  'All unread to begin with');
select is((select unread from public.my_unread_counts() where group_id = pg_temp.g()),
  (select count(*)::integer from public.notifications where group_id = pg_temp.g()),
  'Unread counts per group, for the switcher');
select is(public.mark_notifications_read(array[(select id from public.notifications where type = 'nudge' limit 1)]),
  0, 'Marking someone else''s (or nothing) changes nothing');
select is(public.mark_notifications_read(array[(select id from public.notifications where type = 'level_up')]), 1,
  'Mark one read');
select ok(public.mark_notifications_read() >= 1, 'Mark all read');
select is((select count(*) from public.my_unread_counts()), 0::bigint, '... none left unread');
select throws_ok($$select public.set_notification_preferences('[{"type":"security","channel":"push","enabled":false}]')$$,
  'notification_locked', 'Security alerts can''t be turned off');
select pg_temp.as_postgres();

-- ---------------------------------------------------------------- channels

delete from public.notifications;
select pg_temp.device(:b);
select pg_temp.device(:c);
insert into public.nudges (group_id, from_user, to_user, kind, sender_day)
values (pg_temp.g(), :c, :b, 'praying', current_date);
select pg_temp.work();
select is(pg_temp.delivery(:b, 'nudge', 'push'), 'ready', 'Push on by default for a nudge, with a device: ready');
select is(pg_temp.delivery(:b, 'nudge', 'email'), null, 'Email off by default: no email at all');
insert into public.nudges (group_id, from_user, to_user, kind, sender_day)
values (pg_temp.g(), :c, :a, 'praying', current_date);
select pg_temp.work();
select is((select count(*) from private.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.user_id = :a), 0::bigint, 'No device: no push (the bell still has it)');

-- Quiet hours (around now, in the person's zone).
update public.notification_settings
   set quiet_hours_start = ((now() at time zone 'utc') - interval '1 hour')::time(0),
       quiet_hours_end = ((now() at time zone 'utc') + interval '1 hour')::time(0)
 where user_id = :b;
select set_config('test.p2', pg_temp.post(:o, 'announcement')::text, true);
select pg_temp.work();
select is(pg_temp.delivery(:b, 'announcement', 'push'), 'held:quiet_hours', 'Quiet hours hold a push');
select ok((select release_at from private.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.user_id = :b and n.type = 'announcement') between now() + interval '59 minutes' and now() + interval '61 minutes',
  '... until they end');
insert into public.partnerships (group_id, user_a, user_b, status, accepted_at, b_allows_alerts)
values (pg_temp.g(), :b, :o, 'active', now(), false);
update public.partnerships set a_allows_alerts = true where user_a = :b and user_b = :o;
select pg_temp.device(:o);
update public.notification_settings set quiet_hours_start = '00:00', quiet_hours_end = '23:59' where user_id = :o;
select private.notify('partner_sos', jsonb_build_object('user', :b::uuid));
select pg_temp.work();
select is(pg_temp.delivery(:o, 'partner_sos', 'push'), 'ready', 'Partner SOS goes through quiet hours');
select private.notify('partner_sos', jsonb_build_object('user', :o::uuid));
select pg_temp.work();
select is(pg_temp.count_for(:b, 'partner_sos'), 0::bigint, '... only from someone who allowed alerts (D-083)');

-- Released when the time comes.
update private.notification_deliveries set release_at = now() - interval '1 second'
 where status = 'held' and user_id = :b;
update public.notification_settings set quiet_hours_start = '00:00', quiet_hours_end = '00:00' where user_id = :b;
select pg_temp.work();
select is(pg_temp.delivery(:b, 'announcement', 'push'), 'ready', 'A held push is ready once quiet hours end');

-- Snooze: everything waits, except security.
update public.notification_settings set snooze_until = now() + interval '1 day' where user_id = :b;
select private.notify('direct', jsonb_build_object('user', :b::uuid, 'type', 'daily_reminder', 'dedupe', 'test:snooze'));
select private.notify('security', jsonb_build_object('user', :b::uuid, 'what', 'new_login'));
select pg_temp.work();
select is(pg_temp.delivery(:b, 'daily_reminder', 'push'), 'held:snoozed', 'Snooze holds a reminder');
select is(pg_temp.delivery(:b, 'security', 'push'), 'ready', '... but not a security alert');
select is(pg_temp.delivery(:b, 'security', 'email'), null,
  'Security email isn''t sent twice: the account emails it already (D-030)');
update public.notification_settings set snooze_until = null where user_id = :b;

-- Digest: bundled, then one push at 19:00 local.
update public.notification_settings set digest = 'daily', last_digest_on = null where user_id = :b;
select pg_temp.post(:o, 'announcement');
insert into public.notification_preferences (user_id, type, channel, enabled) values (:b, 'reaction', 'push', true);
insert into public.reactions (group_id, user_id, target_type, target_id, kind)
values (pg_temp.g(), :a, 'post', current_setting('test.post')::uuid, 'strong');
select pg_temp.work();
select is((select count(*) from private.notification_deliveries where user_id = :b and status = 'digest'), 2::bigint,
  'Digest mode keeps non-urgent pushes for the digest');
select is(private.send_digests(((current_date + 1)::timestamp + time '19:05') at time zone 'UTC'), 1,
  'At 19:00 local the digest goes');
select is((select bundle_count from private.notification_deliveries where user_id = :b and notification_id is null), 2,
  '... as one push for both');
select is((select count(*) from private.notification_deliveries where user_id = :b and status = 'bundled'), 2::bigint,
  '... and the two are marked bundled');
select is(private.send_digests(((current_date + 1)::timestamp + time '19:10') at time zone 'UTC'), 0,
  'Once a day');
update public.notification_settings set digest = 'off' where user_id = :b;

-- Group mute: the bell has it, push doesn't.
update public.group_members set notifications_muted = true where group_id = pg_temp.g() and user_id = :b;
select set_config('test.pushes', (select count(*) from private.notification_deliveries where user_id = :b)::text, true);
select pg_temp.post(:o, 'announcement');
select pg_temp.work();
select is(pg_temp.count_for(:b, 'announcement'), 3::bigint, 'A muted group still shows in the bell');
select is((select count(*) from private.notification_deliveries where user_id = :b),
  current_setting('test.pushes')::bigint, '... but sends no push');
update public.group_members set notifications_muted = false where group_id = pg_temp.g() and user_id = :b;

-- The hourly limit.
update public.notification_settings set snooze_until = null where user_id = :b;
select private.deliver(array[:b]::uuid[], 'daily_reminder', null, null, '{}'::jsonb, 'limit:' || i)
  from generate_series(1, 8) i;
select is((select count(*) from private.notification_deliveries
            where user_id = :b and channel = 'push' and reason = 'rate_limited'), 6::bigint,
  'Past the hourly limit, pushes wait in the app instead');

-- Email by choice.
select pg_temp.as_user(:c);
select lives_ok($$select public.set_notification_preferences('[{"type":"announcement","channel":"email","enabled":true}]')$$,
  'Turning a type''s email on');
select pg_temp.as_postgres();
select pg_temp.post(:o, 'announcement');
select pg_temp.work();
select is((select d.status from private.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.user_id = :c and n.type = 'announcement' and d.channel = 'email'
            order by d.created_at desc limit 1), 'ready', '... sends it by email too');

-- ---------------------------------------------------------------- paging a big group

update private.app_config set value = 2 where key = 'notify_fanout_page';
delete from public.notifications;
select pg_temp.post(:a, 'prayer_request');
select pg_temp.work();
select pg_temp.work();
select pg_temp.work();
select is((select count(*) from public.notifications where type = 'prayer_request'), 4::bigint,
  'A fan-out bigger than a page continues in follow-on jobs until everyone has it');
update private.app_config set value = 500 where key = 'notify_fanout_page';

-- ---------------------------------------------------------------- leaving and closing

select pg_temp.as_postgres();
delete from public.group_members where group_id = pg_temp.g() and user_id = :n;
select is((select count(*) from public.notifications where user_id = :n and group_id = pg_temp.g()), 0::bigint,
  'Leaving a group takes its notifications with it');
insert into private.notification_deliveries (user_id, notification_id, channel, status, bundle_count)
values (:c, null, 'push', 'ready', 1);
update public.profiles set deletion_requested_at = now() where id = :c;
select is((select count(*) from private.notification_deliveries where user_id = :c and status = 'ready'), 0::bigint,
  'Closing an account stops what was waiting to be sent');

select * from finish();
rollback;
