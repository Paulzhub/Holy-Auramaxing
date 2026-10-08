-- What a group sees of check-ins (CLAUDE.md §6): only through
-- group_checkins_today, which applies each member's share level IN THAT
-- GROUP. checkin_only never reveals an outcome or a streak; streak adds the
-- current streak; full adds the outcome; a partner adds mood, urges and
-- triggers. Outsiders and people waiting to join see nothing; accounts
-- closing for deletion disappear.
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
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.g() returns uuid language sql as $$ select current_setting('test.g')::uuid $$;
create function pg_temp.add(uid uuid, lvl text, st text default 'active') returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (pg_temp.g(), uid, 'member', st, lvl, now(), case when st = 'active' then now() end);
$$;
-- Checks in for the person's today, at the real time (the view uses now()).
create function pg_temp.checkin(uid uuid, outcome text) returns void language sql as $$
  select private.save_checkin(uid, 'UTC', util.local_today('UTC'), outcome, 2, 4, '{lonely,late_night}', null, now());
$$;
-- The viewer's row for one member, as jsonb (null when there is no row).
create function pg_temp.row_of(uid uuid) returns jsonb language sql as $$
  select to_jsonb(v) - 'group_id' - 'user_id' from public.group_checkins_today v
   where v.group_id = pg_temp.g() and v.user_id = uid
$$;

\set owner '''00000000-0000-7000-8000-000000003201'''
\set quiet '''00000000-0000-7000-8000-000000003202'''
\set streaky '''00000000-0000-7000-8000-000000003203'''
\set open '''00000000-0000-7000-8000-000000003204'''
\set viewer '''00000000-0000-7000-8000-000000003205'''
\set waiting '''00000000-0000-7000-8000-000000003206'''
\set outsider '''00000000-0000-7000-8000-000000003207'''
\set quietcleaner '''00000000-0000-7000-8000-000000003208'''
select pg_temp.make_user(:owner, 'share-owner@example.test');
select pg_temp.make_user(:quiet, 'share-quiet@example.test');
select pg_temp.make_user(:streaky, 'share-streak@example.test');
select pg_temp.make_user(:open, 'share-full@example.test');
select pg_temp.make_user(:viewer, 'share-viewer@example.test');
select pg_temp.make_user(:waiting, 'share-waiting@example.test');
select pg_temp.make_user(:outsider, 'share-outsider@example.test');
select pg_temp.make_user(:quietcleaner, 'share-quiet2@example.test');

select pg_temp.as_user(:owner);
select set_config('test.g', public.create_group('Share levels', null, 'ongoing', null, current_date, 'UTC', 50,
  'invite_only', 'We share honestly, at the level we choose.', 'checkin_only', true, 'checkin_only')::text, true);
select pg_temp.as_postgres();
select pg_temp.add(:quiet, 'checkin_only');
select pg_temp.add(:streaky, 'streak');
select pg_temp.add(:open, 'full');
select pg_temp.add(:viewer, 'checkin_only');
select pg_temp.add(:quietcleaner, 'checkin_only');
select pg_temp.add(:waiting, 'full', 'pending');

-- A clean day yesterday for everyone, then today: three slips and one clean day.
insert into public.checkins (user_id, local_date, timezone, outcome)
select u, util.local_today('UTC') - 1, 'UTC', 'clean'
  from unnest(array[:quiet, :streaky, :open, :quietcleaner]::uuid[]) u;
select pg_temp.checkin(:quiet, 'slipped');
select pg_temp.checkin(:streaky, 'slipped');
select pg_temp.checkin(:open, 'slipped');
select pg_temp.checkin(:quietcleaner, 'clean');

-- ---------------------------------------------------------------- checkin_only

select pg_temp.as_user(:viewer);
select is(pg_temp.row_of(:quiet) ->> 'checked_in_today', 'true', 'checkin_only: the group sees that they checked in');
select is(pg_temp.row_of(:quiet) -> 'outcome', 'null'::jsonb, 'checkin_only: never the outcome (after a slip)');
select is(pg_temp.row_of(:quiet) -> 'current_streak', 'null'::jsonb, '... never the streak, which would give the slip away');
select is(pg_temp.row_of(:quiet) -> 'mood', 'null'::jsonb, '... never the mood');
select is(pg_temp.row_of(:quiet) -> 'triggers', 'null'::jsonb, '... never the triggers');
select is(pg_temp.row_of(:quietcleaner) -> 'outcome', 'null'::jsonb, 'checkin_only: no outcome after a clean day either');
select is(pg_temp.row_of(:quietcleaner) -> 'current_streak', 'null'::jsonb, '... and no streak (so silence can''t be read)');
select is((select count(*) from public.group_checkins_today
            where user_id = '00000000-0000-7000-8000-000000003202' and outcome = 'slipped'), 0::bigint,
  'Filtering on the hidden outcome finds nothing (security barrier)');
select is((select count(*) from public.checkins where user_id <> '00000000-0000-7000-8000-000000003205'), 0::bigint,
  'Other members'' check-ins can''t be read from the table itself');
select is((select count(*) from public.group_member_stats where user_id <> '00000000-0000-7000-8000-000000003205'),
  0::bigint, '... nor their challenge counts, which could reveal a slip');

-- ---------------------------------------------------------------- streak and full

select is(pg_temp.row_of(:streaky) ->> 'current_streak', '0', 'streak: the current streak shows');
select is(pg_temp.row_of(:streaky) -> 'outcome', 'null'::jsonb, 'streak: but not the outcome');
select is(pg_temp.row_of(:streaky) -> 'mood', 'null'::jsonb, 'streak: nor the mood');
select is(pg_temp.row_of(:open) ->> 'outcome', 'slipped', 'full: the outcome shows');
select is(pg_temp.row_of(:open) ->> 'current_streak', '0', 'full: and the streak');
select is(pg_temp.row_of(:open) -> 'mood', 'null'::jsonb, 'full: mood stays between partners');
select is(pg_temp.row_of(:open) -> 'triggers', 'null'::jsonb, 'full: triggers stay between partners');
select is(pg_temp.row_of(:owner) ->> 'checked_in_today', 'false', 'Someone who hasn''t checked in shows as not yet');

-- ---------------------------------------------------------------- yourself, and partners

select pg_temp.as_user(:quiet);
select is(pg_temp.row_of(:quiet) ->> 'outcome', 'slipped', 'You always see your own row in full');
select pg_temp.as_postgres();
-- Partnerships arrive in Phase 6; stand in for one (rolled back with the test).
create or replace function util.are_partners(viewer uuid, owner uuid) returns boolean language sql stable as $$
  select viewer = '00000000-0000-7000-8000-000000003205' and owner = '00000000-0000-7000-8000-000000003202'
$$;
select pg_temp.as_user(:viewer);
select is(pg_temp.row_of(:quiet) ->> 'mood', '2', 'A partner sees the mood, even at checkin_only');
select is(pg_temp.row_of(:quiet) ->> 'urge_level', '4', '... the urge level');
select is(pg_temp.row_of(:quiet) -> 'triggers', '["lonely", "late_night"]'::jsonb, '... and the triggers');
select is(pg_temp.row_of(:open) -> 'mood', 'null'::jsonb, '... only for their partner');

-- ---------------------------------------------------------------- who sees rows at all

select is((select count(*) from public.group_checkins_today where group_id = pg_temp.g()), 6::bigint,
  'A member sees every active member of the group');
select is(pg_temp.row_of(:waiting), null, 'Someone waiting to join isn''t listed');
select pg_temp.as_user(:waiting);
select is((select count(*) from public.group_checkins_today), 0::bigint, 'Someone waiting to join sees nothing');
select pg_temp.as_user(:outsider);
select is((select count(*) from public.group_checkins_today), 0::bigint, 'Someone outside the group sees nothing');
set local role anon;
select throws_ok('select count(*) from public.group_checkins_today', '42501', null, 'Signed-out visitors can''t read it');
select pg_temp.as_postgres();

-- Closing for deletion: gone from the group at once.
update public.profiles set deletion_requested_at = now() where id = :open;
select pg_temp.as_user(:viewer);
select is(pg_temp.row_of(:open), null, 'An account closing for deletion disappears from the group''s view');
-- Removed members disappear too.
select pg_temp.as_postgres();
update public.group_members set status = 'removed' where user_id = :streaky;
select pg_temp.as_user(:viewer);
select is(pg_temp.row_of(:streaky), null, 'A removed member disappears');

select * from finish();
rollback;
