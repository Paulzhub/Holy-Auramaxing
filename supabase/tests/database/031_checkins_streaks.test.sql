-- Streaks and totals (CLAUDE.md §7.5): a slip resets only the current
-- streak; longest streak, total clean days and the check-in streak stay. A
-- missed day ends a run but is never a slip. Edits inside the window replay
-- correctly. Group challenge stats count from the later of the challenge's
-- start and the day someone joined.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

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
-- Writes check-ins straight in (as the database owner), then replays.
create function pg_temp.seed(uid uuid, days text) returns void language plpgsql as $$
declare d text;
begin
  foreach d in array string_to_array(days, ',') loop
    insert into public.checkins (user_id, local_date, timezone, outcome)
    values (uid, split_part(d, '=', 1)::date, 'Asia/Kolkata',
            case split_part(d, '=', 2) when 'c' then 'clean' else 'slipped' end);
  end loop;
  perform private.recompute_user_stats(uid);
end;
$$;
-- The overview at a pinned instant, as a record.
create function pg_temp.o(uid uuid, at timestamptz) returns jsonb language sql as $$
  select private.checkin_overview(uid, 'Asia/Kolkata', at)
$$;

\set a '''00000000-0000-7000-8000-000000003101'''
\set b '''00000000-0000-7000-8000-000000003102'''
\set g '''00000000-0000-7000-8000-000000003103'''
select pg_temp.make_user(:a, 'streak-a@example.test');
select pg_temp.make_user(:b, 'streak-b@example.test');
select pg_temp.make_user(:g, 'streak-g@example.test');
update public.profiles set timezone = 'Asia/Kolkata' where id in (:a, :b, :g);

-- ---------------------------------------------------------------- a slip resets only the current streak

-- Clean 1–5 Oct, slipped on the 6th, clean on the 7th and 8th.
select pg_temp.seed(:a, '2026-10-01=c,2026-10-02=c,2026-10-03=c,2026-10-04=c,2026-10-05=c,2026-10-06=s,2026-10-07=c,2026-10-08=c');
-- 20:00 IST on 8 Oct.
select is((pg_temp.o(:a, '2026-10-08 14:30+00') ->> 'current_streak')::int, 2, 'Current streak: the 7th and 8th');
select is((pg_temp.o(:a, '2026-10-08 14:30+00') ->> 'longest_streak')::int, 5, 'Longest streak: 1–5 October');
select is((pg_temp.o(:a, '2026-10-08 14:30+00') ->> 'total_clean_days')::int, 7, 'Total clean days: 7');
select is((pg_temp.o(:a, '2026-10-08 14:30+00') ->> 'checkin_streak')::int, 8, 'Check-in streak: all 8 days, slip included');
select is((pg_temp.o(:a, '2026-10-08 14:30+00') ->> 'clean_streaks')::int, 2, 'Two separate streaks built');

-- A slip today.
select private.save_checkin(:a, 'Asia/Kolkata', '2026-10-09', 'slipped', null, null, '{}', null, '2026-10-09 04:00+00');
select is((pg_temp.o(:a, '2026-10-09 04:00+00') ->> 'current_streak')::int, 0, 'After a slip the current streak is 0');
select is((pg_temp.o(:a, '2026-10-09 04:00+00') ->> 'longest_streak')::int, 5, '... the longest streak stays 5');
select is((pg_temp.o(:a, '2026-10-09 04:00+00') ->> 'total_clean_days')::int, 7, '... total clean days stay 7');
select is((pg_temp.o(:a, '2026-10-09 04:00+00') ->> 'checkin_streak')::int, 9, '... and the check-in streak grows to 9');
select is((pg_temp.o(:a, '2026-10-09 04:00+00') ->> 'clean_streaks')::int, 2, '... and the streaks already built are kept');

-- ---------------------------------------------------------------- editing inside the window replays

-- Before noon on the 10th, the 9th can still change: the slip becomes clean.
select private.save_checkin(:a, 'Asia/Kolkata', '2026-10-09', 'clean', null, null, '{}', null, '2026-10-10 05:00+00');
select is((pg_temp.o(:a, '2026-10-10 05:00+00') ->> 'current_streak')::int, 3, 'Correcting the 9th to clean: streak 3 (7th–9th)');
select is((pg_temp.o(:a, '2026-10-10 05:00+00') ->> 'total_clean_days')::int, 8, '... and 8 clean days');
-- And back again.
select private.save_checkin(:a, 'Asia/Kolkata', '2026-10-09', 'slipped', null, null, '{}', null, '2026-10-10 05:30+00');
select is((pg_temp.o(:a, '2026-10-10 05:30+00') ->> 'current_streak')::int, 0, 'Correcting it back to a slip: 0 again');
select is((pg_temp.o(:a, '2026-10-10 05:30+00') ->> 'longest_streak')::int, 5, '... longest still 5');

-- Two runs joined by correcting the day between them.
select pg_temp.seed(:b, '2026-10-06=c,2026-10-07=c,2026-10-08=s');
select private.save_checkin(:b, 'Asia/Kolkata', '2026-10-09', 'clean', null, null, '{}', null, '2026-10-09 04:00+00');
select is((pg_temp.o(:b, '2026-10-09 04:00+00') ->> 'longest_streak')::int, 2, 'Two runs of 2 and 1 days: longest 2');
select private.save_checkin(:b, 'Asia/Kolkata', '2026-10-08', 'clean', null, null, '{}', null, '2026-10-09 05:00+00');
select is((pg_temp.o(:b, '2026-10-09 05:00+00') ->> 'current_streak')::int, 4,
  'Correcting yesterday (inside the window) joins them: current 4');
select is((pg_temp.o(:b, '2026-10-09 05:00+00') ->> 'longest_streak')::int, 4, '... longest 4');
select is((pg_temp.o(:b, '2026-10-09 05:00+00') ->> 'clean_streaks')::int, 1, '... and one streak, not two');

-- ---------------------------------------------------------------- a missed day ends a run, but isn't a slip

-- b's last check-in is the 9th (clean, streak 4).
select is((pg_temp.o(:b, '2026-10-10 14:30+00') ->> 'current_streak')::int, 4,
  'The day after, not yet answered: the streak is still alive');
select is((pg_temp.o(:b, '2026-10-11 06:29+00') ->> 'current_streak')::int, 4,
  'Two days later, before 12:00: the 10th can still be answered, so it''s alive');
select is((pg_temp.o(:b, '2026-10-11 06:30+00') ->> 'current_streak')::int, 0,
  'At 12:00 the 10th is missed: the run is over');
select is((pg_temp.o(:b, '2026-10-11 06:30+00') ->> 'checkin_streak')::int, 0, '... the check-in streak too');
select is((pg_temp.o(:b, '2026-10-11 06:30+00') ->> 'longest_streak')::int, 4, '... but nothing else changes');
select is((pg_temp.o(:b, '2026-10-11 06:30+00') ->> 'total_clean_days')::int, 4, '... total clean days stay');
select is((select count(*) from public.checkins where user_id = :b and outcome = 'slipped'), 0::bigint,
  'A missed day is never recorded as a slip');
select is(pg_temp.o(:b, '2026-10-11 06:30+00') -> 'answered', '{}'::jsonb, 'Nothing answered yet in the open window');

-- Nobody has stats before their first check-in; the overview still answers.
select is((pg_temp.o(:g, '2026-10-09 04:00+00') ->> 'current_streak')::int, 0, 'No check-ins yet: streak 0');

-- ---------------------------------------------------------------- group challenge stats

set local request.jwt.claims = '{"sub":"00000000-0000-7000-8000-000000003103","role":"authenticated"}';
set local role authenticated;
select set_config('test.grp', public.create_group('Streak keepers', null, '30', null, '2026-10-01', 'Asia/Kolkata',
  50, 'invite_only', 'We keep watch together.', 'checkin_only', true, 'full')::text, true);
set local role postgres;
-- b joined on the 8th (IST): the 6th and 7th were before joining.
insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
values (current_setting('test.grp')::uuid, :b, 'member', 'active', 'full', now(), '2026-10-08 03:00+00');
select results_eq($$ select clean_days_in_challenge, checkins_in_challenge from public.group_member_stats
                      where user_id = '00000000-0000-7000-8000-000000003102' $$,
  $$ values (2, 2) $$, 'Joining counts check-ins from the day they joined (8th, 9th), not before');
-- The owner moves the start later: the counts follow.
update public.groups set start_date = '2026-10-09', end_date = date '2026-10-09' + 29
 where id = current_setting('test.grp')::uuid;
select results_eq($$ select clean_days_in_challenge, checkins_in_challenge from public.group_member_stats
                      where user_id = '00000000-0000-7000-8000-000000003102' $$,
  $$ values (1, 1) $$, 'Moving the challenge''s start recalculates');
-- Removed: the row goes.
update public.group_members set status = 'removed' where user_id = :b;
select is((select count(*) from public.group_member_stats where user_id = :b), 0::bigint,
  'A removed member''s challenge stats are dropped');

select * from finish();
rollback;
