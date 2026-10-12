-- Late offline check-ins (CLAUDE.md §7.5, §13, D-063, D-067): one made
-- offline for a day that later closed is accepted within
-- offline_sync_max_days and removes that day's missed-day penalty; one too
-- old, for a day outside its recorded window, from the future, from before
-- the account, or for a day already answered is refused.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'Asia/Kolkata' where profiles.id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
-- Replaces someone's check-ins with a pattern starting on p_start (c = stayed
-- free, s = slipped, . = no check-in), makes the account start that day, and
-- replays at p_at.
create function pg_temp.seq(uid uuid, p_start date, pattern text, p_at timestamptz) returns void language plpgsql as $$
declare i integer;
begin
  delete from public.checkins where user_id = uid;
  update public.profiles set created_at = (p_start::timestamp at time zone 'Asia/Kolkata') where id = uid;
  insert into public.checkins (user_id, local_date, timezone, outcome)
  select uid, p_start + (n - 1), 'Asia/Kolkata', case substr(pattern, n, 1) when 'c' then 'clean' else 'slipped' end
    from generate_series(1, length(pattern)) n
   where substr(pattern, n, 1) in ('c', 's');
  perform private.recompute_user_stats(uid);
  perform private.recompute_level(uid, p_at);
end;
$$;
-- Stored replay result as "level/progress/highest".
create function pg_temp.st(uid uuid) returns text language sql as $$
  select level || '/' || level_progress_days || '/' || highest_level from public.user_stats where user_id = uid
$$;
-- Live level at an instant, as "level/progress".
create function pg_temp.lv(uid uuid, at timestamptz) returns text language sql as $$
  select l.level || '/' || l.progress from private.live_level(uid, 'Asia/Kolkata', at) l
$$;

\set a '''00000000-0000-7000-8000-000000005101'''
\set b '''00000000-0000-7000-8000-000000005102'''
select pg_temp.make_user(:a, 'offline-a@example.test');
select pg_temp.make_user(:b, 'offline-b@example.test');

create function pg_temp.sync(uid uuid, d date, rec timestamptz, outcome text, at timestamptz) returns text language sql as $$
  select private.save_offline_checkin(uid, 'Asia/Kolkata', d, rec, outcome, null, null, '{}', null, at)
$$;

select is(util.config_int('offline_sync_max_days'), 7, 'Offline check-ins are accepted for 7 days (owner, 2026-10-10)');

-- Level 25 on 30 May. On 31 May at 20:30 IST the phone is offline and the
-- person answers "stayed free"; it reaches the server on 1 Jun at 13:30 IST,
-- after 31 May's window closed at noon.
select pg_temp.seq(:a, '2026-01-01', repeat('c', 150), '2026-12-01');
select is(pg_temp.lv(:a, '2026-06-01 08:00+00'), '15/0', 'Before the sync, 31 May counts as missed: Level 15');
select is(pg_temp.sync(:a, '2026-05-31', '2026-05-31 15:00+00', 'clean', '2026-06-01 08:00+00'), 'synced_late',
          'The late offline check-in is accepted');
select is(pg_temp.lv(:a, '2026-06-01 08:00+00'), '25/1', '... and the penalty is gone: Level 25, one day of progress');
select is((private.checkin_overview(:a, 'Asia/Kolkata', '2026-06-01 08:00+00') ->> 'total_clean_days')::int, 151,
          '... streaks and totals replay too');
select is((select count(*)::int from public.audit_log
            where actor_id = :a and action = 'checkin.synced_late' and metadata = '{"local_date": "2026-05-31"}'),
          1, 'It is audited as checkin.synced_late, with the date and nothing else');
select throws_ok($$ select pg_temp.sync('00000000-0000-7000-8000-000000005101', '2026-05-31', '2026-05-31 16:00+00', 'slipped', '2026-06-01 09:00+00') $$,
                 'checkin_already_answered', 'A day already answered is refused (the device drops it)');

-- A slip made offline counts as a slip, the same as online.
select pg_temp.seq(:b, '2026-01-01', repeat('c', 150), '2026-12-01');
select is(pg_temp.sync(:b, '2026-05-31', '2026-05-31 15:00+00', 'slipped', '2026-06-01 08:00+00'), 'synced_late',
          'An offline slip syncs late too');
select is(pg_temp.lv(:b, '2026-06-01 08:00+00'), '15/0', '... and costs what a slip costs');

-- Still inside the window when it arrives: an ordinary save.
select is(pg_temp.sync(:b, '2026-06-01', '2026-06-01 02:00+00', 'clean', '2026-06-01 03:00+00'), 'created',
          'Arriving while the day is still open: an ordinary check-in');
select is(pg_temp.sync(:b, '2026-06-01', '2026-06-01 02:30+00', 'slipped', '2026-06-01 03:30+00'), 'updated',
          '... and inside the window, a later one is an edit');

-- Refusals.
select throws_ok($$ select pg_temp.sync('00000000-0000-7000-8000-000000005101', '2026-06-01', '2026-06-01 15:00+00', 'clean', '2026-06-09 15:01+00') $$,
                 'checkin_sync_too_old', 'Older than 7 days: refused');
select is(pg_temp.sync(:a, '2026-06-01', '2026-06-01 15:00+00', 'clean', '2026-06-08 14:59+00'), 'synced_late',
          '... just inside 7 days: accepted');
select throws_ok($$ select pg_temp.sync('00000000-0000-7000-8000-000000005101', '2026-05-29', '2026-05-31 15:00+00', 'clean', '2026-06-01 08:00+00') $$,
                 'checkin_window_closed', 'A day outside its window by the device''s own record: refused');
select throws_ok($$ select pg_temp.sync('00000000-0000-7000-8000-000000005101', '2026-06-03', '2026-06-03 10:00+00', 'clean', '2026-06-03 09:00+00') $$,
                 'checkin_invalid', 'Made "in the future" (device clock ahead): refused');
select throws_ok($$ select pg_temp.sync('00000000-0000-7000-8000-000000005101', '2025-12-30', '2025-12-30 10:00+00', 'clean', '2025-12-31 10:00+00') $$,
                 'checkin_invalid', 'Made before the account existed: refused');
select throws_ok($$ select pg_temp.sync('00000000-0000-7000-8000-000000005101', '2026-06-02', '2026-06-02 10:00+00', 'maybe', '2026-06-03 10:00+00') $$,
                 'checkin_invalid', 'An answer that isn''t one of the two: refused');

-- Through the API, as the person.
select pg_temp.as_user(:a);
select is(public.submit_offline_checkin(util.local_today('Asia/Kolkata'), now(), 'clean'), 'created',
          'submit_offline_checkin works for a signed-in person');
select pg_temp.as_postgres();
update public.profiles set deletion_requested_at = now() where id = :a;
select pg_temp.as_user(:a);
select throws_ok($$ select public.submit_offline_checkin(util.local_today('Asia/Kolkata'), now(), 'clean') $$,
                 'account_closing', 'Refused while the account is closing');
select pg_temp.as_postgres();
set local role anon;
select throws_ok($$ select public.submit_offline_checkin(current_date, now(), 'clean') $$,
                 '42501', null, 'Not callable without signing in');
reset role;

select * from finish();
rollback;
