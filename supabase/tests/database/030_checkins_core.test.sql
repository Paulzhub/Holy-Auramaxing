-- Check-ins (CLAUDE.md §7.5): "today" in each person's own time zone, the
-- window (today, plus yesterday until 12:00 local), midnight and noon edges,
-- half-hour offsets, daylight saving, writes only through the functions,
-- notes stored encrypted, edits audited, and owner-only reads.
begin;
create extension if not exists pgtap with schema extensions;

select plan(47);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
-- Runs a statement and returns the error message, or null if it worked.
create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

-- An encrypted-looking note (the real one comes from encryption.ts).
create function pg_temp.note() returns text language sql as $$
  select 'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:Q2lwaGVydGV4dA'
$$;

\set india '''00000000-0000-7000-8000-000000003001'''
\set newyork '''00000000-0000-7000-8000-000000003002'''
\set other '''00000000-0000-7000-8000-000000003003'''
select pg_temp.make_user(:india, 'checkin-india@example.test');
select pg_temp.make_user(:newyork, 'checkin-ny@example.test');
select pg_temp.make_user(:other, 'checkin-other@example.test');
update public.profiles set timezone = 'Asia/Kolkata' where id = :india;
update public.profiles set timezone = 'America/New_York' where id = :newyork;

-- ---------------------------------------------------------------- "today"

-- India is UTC+5:30: midnight is 18:30 UTC the evening before.
select is(util.local_today('Asia/Kolkata', '2026-10-08 18:29:59+00'), date '2026-10-08',
  'India: 23:59:59 IST is still 8 October');
select is(util.local_today('Asia/Kolkata', '2026-10-08 18:30:00+00'), date '2026-10-09',
  'India: 00:00 IST is 9 October (the half-hour offset)');
-- One instant, two "todays".
select is(util.local_today('Asia/Kolkata', '2026-10-09 03:00:00+00'), date '2026-10-09',
  'At 03:00 UTC on 9 Oct, it is 9 October in India (08:30)');
select is(util.local_today('America/New_York', '2026-10-09 03:00:00+00'), date '2026-10-08',
  '... and still 8 October in New York (23:00 the night before)');
select is(util.local_today('America/New_York', '2026-10-09 04:00:00+00'), date '2026-10-09',
  'New York: midnight EDT is 04:00 UTC');
select is(util.local_today('Asia/Kathmandu', '2026-10-08 18:14:59+00'), date '2026-10-08',
  'Nepal (UTC+5:45): 23:59:59 is still 8 October');
select is(util.local_today('Asia/Kathmandu', '2026-10-08 18:15:00+00'), date '2026-10-09',
  'Nepal: 00:00 is 9 October');

-- ---------------------------------------------------------------- the window

select is(util.checkin_dates('Asia/Kolkata', '2026-10-09 06:29:59+00'), array[date '2026-10-09', date '2026-10-08'],
  'India 11:59:59: today and yesterday are open');
select is(util.checkin_dates('Asia/Kolkata', '2026-10-09 06:30:00+00'), array[date '2026-10-09'],
  'India 12:00: only today');
select is(util.checkin_dates('Asia/Kolkata', '2026-10-08 18:30:00+00'), array[date '2026-10-09', date '2026-10-08'],
  'India 00:00: the new day and yesterday');
select is(util.checkin_dates('America/New_York', '2026-10-09 15:59:59+00'), array[date '2026-10-09', date '2026-10-08'],
  'New York 11:59:59 EDT: today and yesterday');
select is(util.checkin_dates('America/New_York', '2026-10-09 16:00:00+00'), array[date '2026-10-09'],
  'New York 12:00 EDT: only today');

-- Daylight saving, New York 2026: clocks go forward on 8 March, back on 1 November.
select is(util.local_today('America/New_York', '2026-03-08 06:59:59+00'), date '2026-03-08',
  'Spring forward: 01:59:59 EST on 8 March');
select is(util.local_today('America/New_York', '2026-03-08 07:00:00+00'), date '2026-03-08',
  '... the next second is 03:00 EDT, the same day');
select is(util.checkin_dates('America/New_York', '2026-03-08 15:59:59+00'), array[date '2026-03-08', date '2026-03-07'],
  'Spring forward: yesterday open until 11:59:59 EDT (15:59:59 UTC)');
select is(util.checkin_dates('America/New_York', '2026-03-08 16:00:00+00'), array[date '2026-03-08'],
  '... and closed at 12:00 EDT, an hour earlier in UTC than the day before');
select is(util.checkin_dates('America/New_York', '2026-11-01 16:59:59+00'), array[date '2026-11-01', date '2026-10-31'],
  'Fall back: yesterday open until 11:59:59 EST (16:59:59 UTC)');
select is(util.checkin_dates('America/New_York', '2026-11-01 17:00:00+00'), array[date '2026-11-01'],
  '... and closed at 12:00 EST');
select is(util.local_today('America/New_York', '2026-11-02 04:30:00+00'), date '2026-11-01',
  'Fall back: 23:30 EST on the 25-hour day is still 1 November');
select is(util.local_today('America/New_York', '2026-11-02 05:00:00+00'), date '2026-11-02',
  '... and midnight EST is 05:00 UTC');

-- ---------------------------------------------------------------- saving at a pinned time

-- 05:00 UTC on 9 Oct: 10:30 in India (yesterday still open), 01:00 in New York.
select is(private.save_checkin(:india, 'Asia/Kolkata', '2026-10-09', 'clean', 4, 1, '{}', null, '2026-10-09 05:00+00'),
  'created', 'India can answer for today (9 Oct) at 10:30');
select is(private.save_checkin(:india, 'Asia/Kolkata', '2026-10-08', 'clean', null, null, '{}', null, '2026-10-09 05:00+00'),
  'created', '... and for yesterday, before noon');
select is(pg_temp.error_of($$ select private.save_checkin('00000000-0000-7000-8000-000000003001', 'Asia/Kolkata',
  '2026-10-07', 'clean', null, null, '{}', null, '2026-10-09 05:00+00') $$), 'checkin_window_closed',
  'No backfilling further than yesterday');
select is(pg_temp.error_of($$ select private.save_checkin('00000000-0000-7000-8000-000000003001', 'Asia/Kolkata',
  '2026-10-10', 'clean', null, null, '{}', null, '2026-10-09 05:00+00') $$), 'checkin_window_closed',
  'No answering for tomorrow');
select is(pg_temp.error_of($$ select private.save_checkin('00000000-0000-7000-8000-000000003001', 'Asia/Kolkata',
  '2026-10-08', 'slipped', null, null, '{}', null, '2026-10-09 06:30+00') $$), 'checkin_window_closed',
  'At 12:00 IST yesterday closes, edits included');

select is(private.save_checkin(:newyork, 'America/New_York', '2026-10-09', 'clean', null, null, '{}', null,
  '2026-10-09 05:00+00'), 'created', 'New York (01:00 EDT) answers for its own 9 October');
select is(pg_temp.error_of($$ select private.save_checkin('00000000-0000-7000-8000-000000003002', 'America/New_York',
  '2026-10-10', 'clean', null, null, '{}', null, '2026-10-09 23:00+00') $$), 'checkin_window_closed',
  'At 19:00 EDT on 9 Oct, New York can''t answer for 10 Oct (it is already 10 Oct in India)');

-- ---------------------------------------------------------------- edits

select is(private.save_checkin(:india, 'Asia/Kolkata', '2026-10-08', 'slipped', 2, 4, '{tired,late_night}',
  pg_temp.note(), '2026-10-09 05:30+00'), 'updated', 'Editing yesterday inside the window updates it');
select results_eq($$ select outcome, edit_count, triggers from public.checkins
                      where user_id = '00000000-0000-7000-8000-000000003001' and local_date = '2026-10-08' $$,
  $$ values ('slipped'::text, 1, '{tired,late_night}'::text[]) $$, 'The edit is stored and counted');
select results_eq($$ select action, target_type, metadata from public.audit_log
                      where actor_id = '00000000-0000-7000-8000-000000003001' and action like 'checkin.%' $$,
  $$ values ('checkin.edited'::text, 'checkin'::text, '{}'::jsonb) $$,
  'The edit is in the audit log, with no content');
select is((select count(*) from public.audit_log
            where actor_id = '00000000-0000-7000-8000-000000003002' and action like 'checkin.%'), 0::bigint,
  'First answers aren''t audited, only edits');
select is(private.save_checkin(:india, 'Asia/Kolkata', '2026-10-09', 'clean', null, null,
  '{stressed,bored,stressed}', null, '2026-10-09 05:30+00'), 'updated', 'Triggers are de-duplicated ...');
select is((select triggers from public.checkins where user_id = :india and local_date = '2026-10-09'),
  '{bored,stressed}'::text[], '... and kept in the fixed order');

-- ---------------------------------------------------------------- refusals

select is(pg_temp.error_of($$ select private.save_checkin('00000000-0000-7000-8000-000000003001', 'Asia/Kolkata',
  '2026-10-09', 'clean', 6, null, '{}', null, '2026-10-09 05:00+00') $$), 'checkin_invalid', 'Mood is 1 to 5');
select is(pg_temp.error_of($$ select private.save_checkin('00000000-0000-7000-8000-000000003001', 'Asia/Kolkata',
  '2026-10-09', 'clean', null, null, '{boredom}', null, '2026-10-09 05:00+00') $$), 'checkin_invalid',
  'Triggers come from the fixed list');
select is(pg_temp.error_of($$ select private.save_checkin('00000000-0000-7000-8000-000000003001', 'Asia/Kolkata',
  '2026-10-09', 'relapsed', null, null, '{}', null, '2026-10-09 05:00+00') $$), 'checkin_invalid',
  'Only clean or slipped');
select is(pg_temp.error_of($$ select private.save_checkin('00000000-0000-7000-8000-000000003001', 'Asia/Kolkata',
  '2026-10-09', 'clean', null, null, '{}', 'I was tired and alone', '2026-10-09 05:00+00') $$), 'checkin_invalid',
  'A plaintext note is refused: notes are stored encrypted');
select is(pg_temp.error_of($$ update public.checkins set note_encrypted = 'plain words'
  where user_id = '00000000-0000-7000-8000-000000003001' $$),
  'new row for relation "checkins" violates check constraint "checkins_note_encrypted_check"',
  '... even writing the table directly as the database owner');
select is((select count(*) from public.checkins where note_encrypted is not null and note_encrypted !~ '^v1:'),
  0::bigint, 'Every stored note is in the encrypted format');

-- ---------------------------------------------------------------- through the API

select pg_temp.as_user(:other);
select is(public.submit_checkin(util.local_today('UTC'), 'clean', 3, 0, '{}', null), 'created',
  'A person checks in for today through the API');
select is(pg_temp.error_of($$ insert into public.checkins (user_id, local_date, timezone, outcome)
  values ('00000000-0000-7000-8000-000000003003', current_date - 1, 'UTC', 'clean') $$),
  'permission denied for table checkins', 'Nobody inserts check-ins directly');
select is(pg_temp.error_of($$ update public.user_stats set longest_streak = 999 $$),
  'permission denied for table user_stats', 'Nobody writes their own stats');
select is((select count(*) from public.checkins), 1::bigint, 'A person reads only their own check-ins');
select is((select count(*) from public.user_stats), 1::bigint, '... and only their own stats');
select pg_temp.as_postgres();

set local role anon;
select is(pg_temp.error_of($$ select public.submit_checkin(current_date, 'clean') $$),
  'permission denied for function submit_checkin', 'Signed-out visitors can''t check in');
select pg_temp.as_postgres();

-- Closing accounts can't check in; time-zone changes are audited (no zone).
update public.profiles set deletion_requested_at = now() where id = :other;
select pg_temp.as_user(:other);
select is(pg_temp.error_of($$ select public.submit_checkin(util.local_today('UTC'), 'slipped') $$),
  'account_closing', 'An account closing for deletion can''t check in');
select pg_temp.as_postgres();
update public.profiles set timezone = 'Asia/Kolkata' where id = :newyork;
select results_eq($$ select distinct action, metadata from public.audit_log
                      where actor_id = '00000000-0000-7000-8000-000000003002' and action = 'profile.timezone_changed' $$,
  $$ values ('profile.timezone_changed'::text, '{}'::jsonb) $$, 'Changing time zone is audited, without the zone');

select * from finish();
rollback;
