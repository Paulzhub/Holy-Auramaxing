-- Phase 7b: the reminder scheduler (CLAUDE.md §7.5, §7.8, §14; D-091).
-- Runs every 15 minutes and picks people by their own local time; every
-- notification is keyed, so running twice never sends twice. Closing
-- accounts get nothing.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(21);

create function pg_temp.make_user(id uuid, email text, tz text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', tz, 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = tz, created_at = now() - interval '60 days', onboarded_at = now()
   where profiles.id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
-- A moment on the test's "day", local to a zone.
create function pg_temp.at(t time, tz text default 'UTC', plus integer default 0) returns timestamptz language sql as $$
  select ((current_date + plus)::timestamp + t) at time zone tz
$$;
create function pg_temp.run(p_now timestamptz) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  v := private.notify_schedule(p_now);
  perform private.run_notify(1000, true);
  return v;
end;
$$;
create function pg_temp.count_for(uid uuid, t text) returns bigint language sql as $$
  select count(*) from public.notifications where user_id = uid and type = t
$$;

\set r '''00000000-0000-7000-8000-000000009101'''
\set k '''00000000-0000-7000-8000-000000009102'''
\set s '''00000000-0000-7000-8000-000000009103'''
\set q '''00000000-0000-7000-8000-000000009104'''
\set x '''00000000-0000-7000-8000-000000009105'''
select pg_temp.make_user(:r, 'sch-r@example.test', 'UTC');
select pg_temp.make_user(:k, 'sch-k@example.test', 'Asia/Kolkata');
select pg_temp.make_user(:s, 'sch-s@example.test', 'UTC');
select pg_temp.make_user(:q, 'sch-q@example.test', 'UTC');
select pg_temp.make_user(:x, 'sch-x@example.test', 'UTC');
update public.notification_settings set reminder_time = '08:00' where user_id in (:r, :k, :x);
update public.profiles set deletion_requested_at = now() where id = :x;

-- ---------------------------------------------------------------- the daily reminder

select pg_temp.run(pg_temp.at('07:50', 'UTC', 1));
select is(pg_temp.count_for(:r, 'daily_reminder'), 0::bigint, 'Not before the reminder time');
select pg_temp.run(pg_temp.at('08:00', 'UTC', 1));
select is(pg_temp.count_for(:r, 'daily_reminder'), 1::bigint, 'At the person''s reminder time');
select pg_temp.run(pg_temp.at('08:15', 'UTC', 1));
select is(pg_temp.count_for(:r, 'daily_reminder'), 1::bigint, 'The next run doesn''t send it again');
select is(pg_temp.count_for(:k, 'daily_reminder'), 0::bigint, 'Someone in Kolkata isn''t woken at 08:00 UTC');
select pg_temp.run(pg_temp.at('08:05', 'Asia/Kolkata', 1));
select is(pg_temp.count_for(:k, 'daily_reminder'), 1::bigint, '... but at 08:00 in Kolkata');
select is(pg_temp.count_for(:x, 'daily_reminder'), 0::bigint, 'A closing account gets no reminders');
select is(pg_temp.count_for(:s, 'daily_reminder'), 0::bigint, 'No reminder time: no reminder');
-- Checked in already: no reminder.
insert into public.checkins (user_id, local_date, timezone, outcome) values (:r, current_date + 2, 'UTC', 'clean');
select pg_temp.run(pg_temp.at('08:00', 'UTC', 2));
select is(pg_temp.count_for(:r, 'daily_reminder'), 1::bigint, 'Checked in today: no reminder');

-- ---------------------------------------------------------------- streak at risk

-- s answered yesterday (day 3), not yet today (day 4).
insert into public.checkins (user_id, local_date, timezone, outcome) values (:s, current_date + 3, 'UTC', 'clean');
select private.recompute_user_stats(:s);
select pg_temp.run(pg_temp.at('19:40', 'UTC', 4));
select is(pg_temp.count_for(:s, 'streak_at_risk'), 0::bigint, 'Not before the evening');
select pg_temp.run(pg_temp.at('20:00', 'UTC', 4));
select is(pg_temp.count_for(:s, 'streak_at_risk'), 1::bigint, 'At 20:00, if yesterday was answered and today isn''t');
select is(pg_temp.count_for(:q, 'streak_at_risk'), 0::bigint, 'Nothing going on: no "still time today"');

-- ---------------------------------------------------------------- partner alerts

select pg_temp.as_user(:q);
select set_config('test.g', public.create_group('Schedule group', null, 'ongoing', null, current_date, 'UTC', 50,
                  'invite_only', 'A covenant for the clock.', 'checkin_only', true, 'full')::text, true);
select pg_temp.as_postgres();
insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
values (current_setting('test.g')::uuid, :s, 'member', 'active', 'full', now(), now());
insert into public.partnerships (group_id, user_a, user_b, status, requested_at, accepted_at, a_allows_alerts, b_allows_alerts)
values (current_setting('test.g')::uuid, :s, :q, 'active', now() - interval '5 days', now() - interval '5 days', true, false);
delete from public.notifications;
-- s's last check-in was day 3. On day 5 at noon only day 4 has closed: one day.
select pg_temp.run(pg_temp.at('12:30', 'UTC', 5));
select is(pg_temp.count_for(:q, 'partner_missed'), 0::bigint, 'One missed day: no partner alert');
select pg_temp.run(pg_temp.at('11:30', 'UTC', 6));
select is(pg_temp.count_for(:q, 'partner_missed'), 0::bigint, 'The second day isn''t missed until its window closes');
select pg_temp.run(pg_temp.at('12:15', 'UTC', 6));
select is(pg_temp.count_for(:q, 'partner_missed'), 1::bigint, 'Two days closed without a check-in: the partner hears');
select is((select data from public.notifications where user_id = :q and type = 'partner_missed'), '{}'::jsonb,
  '... with nothing about any answer');
select is((select actor_id from public.notifications where user_id = :q and type = 'partner_missed'), :s::uuid,
  '... naming the partner');
select pg_temp.run(pg_temp.at('12:15', 'UTC', 7));
select is(pg_temp.count_for(:q, 'partner_missed'), 1::bigint, 'Once per absence, not every day');
select is(pg_temp.count_for(:s, 'partner_missed'), 0::bigint, 'q didn''t allow alerts, so s hears nothing of q');

-- ---------------------------------------------------------------- the Sunday recap and challenges

select pg_temp.run(((date_trunc('week', current_date + 7) + interval '6 days')::timestamp + time '18:05') at time zone 'UTC');
select is(pg_temp.count_for(:q, 'weekly_recap'), 1::bigint, 'The Sunday recap at 18:00 local');

update public.groups set start_date = current_date + 9 where id = current_setting('test.g')::uuid;
select pg_temp.run(pg_temp.at('06:00', 'UTC', 9));
select pg_temp.run(pg_temp.at('06:15', 'UTC', 9));
select is(pg_temp.count_for(:s, 'challenge'), 1::bigint, 'A challenge''s first day notifies the group, once');

-- ---------------------------------------------------------------- retention

update public.notifications set created_at = now() - interval '91 days' where user_id = :q and type = 'weekly_recap';
select private.notify_schedule(now());
select is(pg_temp.count_for(:q, 'weekly_recap'), 0::bigint, 'Notifications go after 90 days (§11)');

select * from finish();
rollback;
