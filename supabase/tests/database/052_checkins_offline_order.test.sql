-- An offline check-in never replaces a newer answer (CLAUDE.md §7.5, §13,
-- D-122). While a day is still open, a check-in from the device's queue is an
-- ordinary save, but only if nothing was saved for that day at or after the
-- moment it was made. A second send of the same queued item is refused, so
-- each check-in is synced exactly once.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'Asia/Kolkata', created_at = now() - interval '30 days'
   where profiles.id = make_user.id;
end;
$$;

\set a '''00000000-0000-7000-8000-000000005201'''
select pg_temp.make_user(:a, 'offline-order-a@example.test');

-- Today in the person's time zone (the day is open all day).
create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;
create function pg_temp.sync(rec timestamptz, outcome text) returns text language sql as $$
  select private.save_offline_checkin('00000000-0000-7000-8000-000000005201', 'Asia/Kolkata', pg_temp.today(), rec,
                                      outcome, null, null, '{}', null, now())
$$;
create function pg_temp.answer() returns text language sql as $$
  select outcome from public.checkins
   where user_id = '00000000-0000-7000-8000-000000005201' and local_date = pg_temp.today()
$$;

-- 1. Answered online now ("slipped"); a "stayed free" made offline an hour
--    earlier arrives afterwards. The newer, online answer stays.
select private.save_checkin(:a, 'Asia/Kolkata', pg_temp.today(), 'slipped', null, null, '{}', null, now());
select throws_ok($$ select pg_temp.sync(now() - interval '1 hour', 'clean') $$, 'checkin_already_answered',
                 'An offline answer older than the saved one is refused (the device drops it)');
select is(pg_temp.answer(), 'slipped', '... and the newer answer is kept');

-- 2. Answered online two hours ago; the offline answer was made one hour ago,
--    so it is newer: it is saved as an edit, as if answered online.
alter table public.checkins disable trigger checkins_touch_updated_at;
update public.checkins set created_at = now() - interval '2 hours', updated_at = now() - interval '2 hours'
 where user_id = :a and local_date = pg_temp.today();
alter table public.checkins enable trigger checkins_touch_updated_at;
select is(pg_temp.sync(now() - interval '1 hour', 'clean'), 'updated',
          'An offline answer newer than the saved one is saved, like an edit online');
select is(pg_temp.answer(), 'clean', '... and it is now the answer');

-- 3. The same queued item is sent again (the reply was lost): refused, nothing changes.
select throws_ok($$ select pg_temp.sync(now() - interval '1 hour', 'clean') $$, 'checkin_already_answered',
                 'Sending the same queued check-in twice is refused the second time');
select is((select count(*)::int from public.checkins where user_id = :a), 1, '... and there is still one check-in');

-- 4. A day with no answer yet: an ordinary save.
delete from public.checkins where user_id = :a;
select is(pg_temp.sync(now() - interval '1 hour', 'slipped'), 'created', 'A day without an answer is saved');
select throws_ok($$ select pg_temp.sync(now() - interval '1 hour', 'slipped') $$, 'checkin_already_answered',
                 '... once');

-- 5. The function is still only reachable through submit_offline_checkin.
select ok(not has_function_privilege('authenticated',
          'private.save_offline_checkin(uuid, text, date, timestamptz, text, integer, integer, text[], text, timestamptz)',
          'execute'), 'save_offline_checkin is not callable by signed-in users directly');

select * from finish();
rollback;
