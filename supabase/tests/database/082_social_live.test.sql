-- Live updates and reactions on check-ins (CLAUDE.md §7.7, D-086, D-087).
-- The channel name is an HMAC of the group and the day, given only to
-- members; pings say what changed and nothing else; reacting to a check-in
-- works only for another active member's check-in in a group you share.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'UTC' where profiles.id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.set(k text, v text) returns void language sql as $$ select set_config('test.' || k, v, true) $$;
create function pg_temp.get(k text) returns uuid language sql as $$ select current_setting('test.' || k)::uuid $$;
create function pg_temp.add_member(gid uuid, uid uuid) returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (gid, uid, 'member', 'active', 'checkin_only', now(), now());
$$;

\set o '''00000000-0000-7000-8000-000000008201'''
\set m '''00000000-0000-7000-8000-000000008202'''
\set x '''00000000-0000-7000-8000-000000008203'''
select pg_temp.make_user(:o, 'live-owner@example.test');
select pg_temp.make_user(:m, 'live-member@example.test');
select pg_temp.make_user(:x, 'live-outsider@example.test');

select pg_temp.as_user(:o);
select pg_temp.set('g', public.create_group('Live group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'A covenant for live.', 'checkin_only', true, 'full')::text);
select pg_temp.as_user(:x);
select pg_temp.set('gx', public.create_group('Other group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'Another covenant.', 'checkin_only', true, 'full')::text);
select pg_temp.as_postgres();
select pg_temp.add_member(pg_temp.get('g'), :m);

-- ---------------------------------------------------------------- the topic

select pg_temp.as_user(:o);
select set_config('test.topic', public.group_live_topic(pg_temp.get('g')), true);
select matches(current_setting('test.topic'), '^group:[0-9a-f]{40}$', 'The channel name is a 40-character HMAC');
select ok(strpos(current_setting('test.topic'), replace(pg_temp.get('g')::text, '-', '')) = 0
          and strpos(current_setting('test.topic'), pg_temp.get('g')::text) = 0,
  '... that doesn''t contain the group''s id');
select pg_temp.as_user(:m);
select is(public.group_live_topic(pg_temp.get('g')), current_setting('test.topic'), 'Every member gets the same name today');
select pg_temp.as_user(:x);
select throws_ok(format($$ select public.group_live_topic(%L) $$, pg_temp.get('g')),
  '42501', 'group_not_found', 'Someone outside the group doesn''t');
select pg_temp.as_postgres();
select isnt(private.group_topic(pg_temp.get('g'), current_date + 1), current_setting('test.topic'),
  'Tomorrow''s name is different');
select isnt(private.group_topic(pg_temp.get('gx'), (now() at time zone 'utc')::date), current_setting('test.topic'),
  '... and so is another group''s');
select is((select count(*) from pg_proc where proname = 'group_topic' and has_function_privilege('authenticated', oid, 'execute')),
  0::bigint, 'Nobody can work out a name through the API');
select is((select count(*) from information_schema.role_table_grants
            where table_schema = 'private' and table_name = 'realtime_keys' and grantee in ('anon', 'authenticated')),
  0::bigint, '... or read the key');

-- ---------------------------------------------------------------- pings

delete from realtime.messages where topic = current_setting('test.topic');
select pg_temp.as_user(:m);
select pg_temp.set('p', public.create_post(pg_temp.get('g'), 'prayer_request', 'Something private about my week.')::text);
select pg_temp.as_postgres();
select results_eq(
  format($$ select event, private, payload - 'id' from realtime.messages where topic = %L $$, current_setting('test.topic')),
  $$ values ('changed'::text, false, '{"what": "wall"}'::jsonb) $$,
  'A new post sends one ping that says only "the wall changed"');
select is((select count(*) from realtime.messages where payload::text like '%private about my week%'), 0::bigint,
  '... never the words');
delete from realtime.messages where topic = current_setting('test.topic');
insert into public.checkins (user_id, local_date, timezone, outcome) values (:m, util.local_today('UTC'), 'UTC', 'clean');
select is((select array_agg(payload ->> 'what') from realtime.messages where topic = current_setting('test.topic')),
  array['today'], 'A check-in pings Today in the person''s groups, without the answer');

-- ---------------------------------------------------------------- reactions on check-ins

select set_config('test.c', (select id::text from public.checkins where user_id = :m), true);
select pg_temp.as_user(:o);
select lives_ok(format($$ select public.react_to_checkin(%L, %L, 'strong', true) $$, pg_temp.get('g'), pg_temp.get('c')),
  'A member reacts to another member''s check-in');
select is((select reactions ->> 'strong' from public.group_checkin_reactions(pg_temp.get('g'))
            where checkin_id = pg_temp.get('c')), '1', '... and the group sees the count');
select pg_temp.as_user(:m);
select throws_ok(format($$ select public.react_to_checkin(%L, %L, 'heart', true) $$, pg_temp.get('g'), pg_temp.get('c')),
  '42501', 'checkin_not_found', 'Nobody reacts to their own check-in');
select pg_temp.as_user(:x);
select throws_ok(format($$ select public.react_to_checkin(%L, %L, 'heart', true) $$, pg_temp.get('gx'), pg_temp.get('c')),
  '42501', 'checkin_not_found', 'A check-in from someone outside your group can''t be reached through your own');
select pg_temp.as_user(:m);
select public.block_member(:o);
select pg_temp.as_user(:o);
select throws_ok(format($$ select public.react_to_checkin(%L, %L, 'dove', true) $$, pg_temp.get('g'), pg_temp.get('c')),
  '42501', 'checkin_not_found', '... nor across a block');
select pg_temp.as_postgres();
delete from public.checkins where id = pg_temp.get('c');
select is((select count(*) from public.reactions where target_type = 'checkin' and target_id = pg_temp.get('c')),
  0::bigint, 'When a check-in goes, its reactions go too');

select * from finish();
rollback;
