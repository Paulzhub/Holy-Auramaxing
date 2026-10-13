-- Nudges, accountability partners and milestone cards (CLAUDE.md §7.7, §3,
-- D-082 to D-085). One nudge per sender, recipient and day, however many
-- times it's asked; muting works everywhere or per group; partners are a
-- mutual opt-in inside one group (two at most each), see each other's detail
-- only there, choose their own alerts, and part when either leaves, blocks or
-- closes their account; milestone cards appear only where the member shares
-- their streak and hasn't turned them off.
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'UTC', created_at = now() - interval '60 days' where profiles.id = make_user.id;
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
create function pg_temp.add_member(gid uuid, uid uuid, share text default 'full') returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (gid, uid, 'member', 'active', share, now(), now());
$$;
create function pg_temp.jobs() returns void language plpgsql as $$
begin
  perform pg_temp.as_postgres();
  perform private.run_jobs(1000, true);
end;
$$;
create function pg_temp.free_days(uid uuid, n integer) returns void language sql as $$
  insert into public.checkins (user_id, local_date, timezone, outcome)
  select uid, util.local_today('UTC') - d, 'UTC', 'clean' from generate_series(1, n) d;
$$;
-- How many times a call can be made before it's refused (any error).
create function pg_temp.tries(p_sql text, n integer) returns integer language plpgsql as $$
declare i integer; ok integer := 0;
begin
  for i in 1..n loop
    begin
      execute p_sql;
      ok := ok + 1;
    exception when others then
      null;
    end;
  end loop;
  return ok;
end;
$$;

\set o '''00000000-0000-7000-8000-000000008101'''
\set m '''00000000-0000-7000-8000-000000008102'''
\set q '''00000000-0000-7000-8000-000000008103'''
\set p1 '''00000000-0000-7000-8000-000000008104'''
\set p2 '''00000000-0000-7000-8000-000000008105'''
\set p3 '''00000000-0000-7000-8000-000000008106'''
\set z '''00000000-0000-7000-8000-000000008107'''
select pg_temp.make_user(:o, 'np-owner@example.test');
select pg_temp.make_user(:m, 'np-member@example.test');
select pg_temp.make_user(:q, 'np-quiet@example.test');
select pg_temp.make_user(:p1, 'np-p1@example.test');
select pg_temp.make_user(:p2, 'np-p2@example.test');
select pg_temp.make_user(:p3, 'np-p3@example.test');
select pg_temp.make_user(:z, 'np-closing@example.test');

select pg_temp.as_user(:o);
select pg_temp.set('g', public.create_group('Nudge group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'A covenant for nudges.', 'checkin_only', true, 'full')::text);
select pg_temp.set('g2', public.create_group('Second group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'Another covenant.', 'checkin_only', true, 'full')::text);
select pg_temp.as_postgres();
select pg_temp.add_member(pg_temp.get('g'), :m);
select pg_temp.add_member(pg_temp.get('g'), :q, 'checkin_only');
select pg_temp.add_member(pg_temp.get('g'), :p1);
select pg_temp.add_member(pg_temp.get('g'), :p2);
select pg_temp.add_member(pg_temp.get('g'), :p3);
select pg_temp.add_member(pg_temp.get('g'), :z);
select pg_temp.add_member(pg_temp.get('g2'), :m);
select pg_temp.add_member(pg_temp.get('g2'), :q, 'checkin_only');
insert into public.checkins (user_id, local_date, timezone, outcome, mood, urge_level, triggers)
values (:q, util.local_today('UTC'), 'UTC', 'slipped', 2, 4, '{lonely}');

-- ---------------------------------------------------------------- nudges

select pg_temp.as_user(:m);
select isnt(public.send_nudge(pg_temp.get('g'), :q, 'praying'), null, 'A member nudges another');
select throws_ok(format($$ select public.send_nudge(%L, %L, 'praying') $$, pg_temp.get('g'), :q),
  'P0001', 'nudge_already_sent', 'A second nudge to the same person the same day is refused');
select is(pg_temp.tries(format($$ select public.send_nudge(%L, %L, 'got_this') $$, pg_temp.get('g2'), :q), 25), 0,
  '... whatever the kind or the group, however often it''s asked');
select is((select count(*) from public.nudges where from_user = :m and to_user = :q), 1::bigint,
  'Only one nudge was kept');
select throws_ok(format($$ select public.send_nudge(%L, auth.uid(), 'praying') $$, pg_temp.get('g')),
  '22023', 'invalid_input', 'Nobody nudges themselves');
select throws_ok(format($$ select public.send_nudge(%L, %L, 'shout') $$, pg_temp.get('g'), :p1),
  '22023', 'invalid_input', 'Only the four nudges (and a prayer request) exist');
select ok((select sent_today from public.group_nudge_targets(pg_temp.get('g')) where user_id = :q),
  'The nudge list knows who I''ve nudged today');

select pg_temp.as_user(:q);
select is((select count(*) from public.my_nudges(pg_temp.get('g'))), 1::bigint, 'The recipient sees the nudge');
select pg_temp.as_user(:p1);
select is((select count(*) from public.nudges where to_user = :q), 0::bigint, 'Nobody else can read it');

select pg_temp.as_user(:q);
select public.set_group_nudges_muted(pg_temp.get('g'), true);
select pg_temp.as_user(:p1);
select throws_ok(format($$ select public.send_nudge(%L, %L, 'praying') $$, pg_temp.get('g'), :q),
  'P0001', 'nudges_muted', 'Muting in a group stops nudges there');
select ok(not exists (select 1 from public.group_nudge_targets(pg_temp.get('g')) where user_id = :q),
  '... and the person drops off the nudge list');
select pg_temp.as_user(:p2);
update public.privacy_settings set nudges_muted = true where user_id = auth.uid();
select pg_temp.as_user(:p1);
select throws_ok(format($$ select public.send_nudge(%L, %L, 'praying') $$, pg_temp.get('g'), :p2),
  'P0001', 'nudges_muted', 'Muting everywhere stops them in every group');
select pg_temp.as_user(:p2);
update public.privacy_settings set nudges_muted = false where user_id = auth.uid();

select pg_temp.as_postgres();
insert into private.rate_limit_counters (user_id, bucket, window_started_at, hits) values (:p3, 'nudge', now(), 60);
select pg_temp.as_user(:p3);
select throws_ok(format($$ select public.send_nudge(%L, %L, 'praying') $$, pg_temp.get('g'), :p1),
  'PT429', 'rate_limited', 'Past 60 nudges an hour, the database refuses (D-051)');

select pg_temp.jobs();
select is((select count(*) from public.xp_ledger where user_id = :m and reason = 'encouragement'
             and group_id = pg_temp.get('g') and source_key like 'encouragement:nudge:%'), 1::bigint,
  'A nudge earns encouragement XP in that group');

-- ---------------------------------------------------------------- partners

select pg_temp.as_user(:m);
select pg_temp.set('pq', public.request_partner(pg_temp.get('g'), :q)::text);
select throws_ok(format($$ select public.request_partner(%L, %L) $$, pg_temp.get('g'), :q),
  'P0001', 'partner_already', 'Asking twice is refused');
select throws_ok(format($$ select public.respond_partner(%L, true) $$, pg_temp.get('pq')),
  '42501', 'group_forbidden', 'The person who asked can''t accept for the other');
select pg_temp.as_user(:q);
select results_eq(format($$ select asked_by_me, status from public.my_partnerships(%L) $$, pg_temp.get('g')),
  $$ values (false, 'pending') $$, 'The person asked sees the request');
select throws_ok(format($$ select public.request_partner(%L, %L) $$, pg_temp.get('g'), :m),
  'P0001', 'partner_already', '... and asking back is refused too');
select lives_ok(format($$ select public.respond_partner(%L, true) $$, pg_temp.get('pq')), 'They accept');

select pg_temp.as_user(:m);
select is((select mood from public.group_checkins_today where group_id = pg_temp.get('g') and user_id = :q), 2::smallint,
  'A partner sees mood, urges and triggers in the group where they are partners, even at checkin_only');
select is((select outcome from public.group_checkins_today where group_id = pg_temp.get('g2') and user_id = :q), null,
  '... but not in another group they share');
select pg_temp.as_user(:p1);
select is((select mood from public.group_checkins_today where group_id = pg_temp.get('g') and user_id = :q), null::smallint,
  'Nobody else sees them');
select pg_temp.as_postgres();
update public.profiles set testimony = 'My story.' where id = :q;
select pg_temp.as_user(:m);
select is((select testimony from public.profile_cards where id = :q), 'My story.',
  'A partner sees what is shared with partners only (the testimony starts there)');
select pg_temp.as_user(:p1);
select is((select testimony from public.profile_cards where id = :q), null, '... and other members don''t');

select pg_temp.as_user(:q);
select public.set_partner_alerts(pg_temp.get('pq'), true);
select pg_temp.as_postgres();
select ok((select b_allows_alerts and not a_allows_alerts from public.partnerships where id = pg_temp.get('pq')),
  'Each partner chooses their own alerts');

-- Two partners at most each in a group.
select pg_temp.as_user(:m);
select pg_temp.set('pp1', public.request_partner(pg_temp.get('g'), :p1)::text);
select throws_ok(format($$ select public.request_partner(%L, %L) $$, pg_temp.get('g'), :p2),
  'P0001', 'partners_full', 'With one partner and one request open, a third request is refused');
select pg_temp.as_user(:p1);
select public.respond_partner(pg_temp.get('pp1'), true);
select pg_temp.as_user(:p2);
select pg_temp.set('pp2', public.request_partner(pg_temp.get('g'), :m)::text);
select pg_temp.as_user(:m);
select throws_ok(format($$ select public.respond_partner(%L, true) $$, pg_temp.get('pp2')),
  'P0001', 'partners_full', 'Accepting a third partner is refused');
select lives_ok(format($$ select public.respond_partner(%L, false) $$, pg_temp.get('pp2')), '... declining is fine');

select pg_temp.as_user(:p3);
select throws_ok(format($$ select public.end_partnership(%L) $$, pg_temp.get('pq')),
  '42501', 'partnership_not_found', 'Someone else can''t end a partnership');
select is((select count(*) from public.partnerships), 0::bigint, '... or read it');

-- Requests lapse after 14 days.
select pg_temp.as_user(:p3);
select pg_temp.set('pp3', public.request_partner(pg_temp.get('g'), :p2)::text);
select pg_temp.as_postgres();
update public.partnerships set requested_at = now() - interval '15 days' where id = pg_temp.get('pp3');
select pg_temp.as_user(:p2);
select throws_ok(format($$ select public.respond_partner(%L, true) $$, pg_temp.get('pp3')),
  'P0001', 'partner_request_closed', 'A request older than 14 days can''t be accepted');

-- What ends a partnership.
select pg_temp.as_user(:p1);
select public.leave_group(pg_temp.get('g'));
select pg_temp.as_postgres();
select results_eq(format($$ select status, ended_reason from public.partnerships where id = %L $$, pg_temp.get('pp1')),
  $$ values ('ended', 'left') $$, 'Leaving the group ends the partnership');
select pg_temp.as_user(:q);
select public.block_member(:m);
select pg_temp.as_postgres();
select results_eq(format($$ select status, ended_reason from public.partnerships where id = %L $$, pg_temp.get('pq')),
  $$ values ('ended', 'blocked') $$, 'A block ends it');
select is((select count(*) from public.nudges where :q in (from_user, to_user) and :m in (from_user, to_user)), 0::bigint,
  '... and removes their nudges');
select pg_temp.as_user(:m);
select is((select mood from public.group_checkins_today where group_id = pg_temp.get('g') and user_id = :q), null::smallint,
  'After it ends, the detail is private again');
select throws_ok(format($$ select public.send_nudge(%L, %L, 'praying') $$, pg_temp.get('g'), :q),
  '42501', 'member_not_found', 'Nobody nudges across a block');
select throws_ok(format($$ select public.request_partner(%L, %L) $$, pg_temp.get('g'), :q),
  '42501', 'member_not_found', '... or asks to be partners');

select pg_temp.as_user(:z);
select pg_temp.set('pz', public.request_partner(pg_temp.get('g'), :p3)::text);
select pg_temp.as_user(:p3);
select public.respond_partner(pg_temp.get('pz'), true);
select pg_temp.as_postgres();
update public.profiles set deletion_requested_at = now() where id = :z;
select results_eq(format($$ select status, ended_reason from public.partnerships where id = %L $$, pg_temp.get('pz')),
  $$ values ('ended', 'closing') $$, 'Starting to close an account ends its partnerships');

-- ---------------------------------------------------------------- milestone cards

select pg_temp.as_postgres();
select pg_temp.free_days(:m, 7);
select pg_temp.free_days(:q, 7);
select pg_temp.free_days(:p2, 3);
select pg_temp.jobs();
select is((select count(*) from public.posts where kind = 'milestone' and author_id = :m and badge = 'free_7'), 2::bigint,
  'Seven free days post a milestone card to each group where the member shares their streak');
select is((select count(*) from public.posts where kind = 'milestone' and author_id = :q), 0::bigint,
  'Never where they share only that they checked in');
select is((select count(*) from public.posts where kind = 'milestone' and author_id = :p2), 0::bigint,
  'Badges below seven days post no card');

select pg_temp.as_user(:o);
select pg_temp.set('ms', (select id::text from public.group_wall(pg_temp.get('g'), 'milestone') where author_id = :m));
select isnt(pg_temp.get('ms'), null, 'The group sees the card on its wall');
select lives_ok(format($$ select public.set_reaction('post', %L, 'fire', true) $$, pg_temp.get('ms')),
  '... and can react to it');
select pg_temp.as_user(:m);
select throws_ok(format($$ select public.edit_post(%L, 'Words') $$, pg_temp.get('ms')),
  '42501', 'group_forbidden', 'A card has no words to edit');
update public.privacy_settings set milestone_cards = false where user_id = auth.uid();
select pg_temp.as_user(:o);
select is((select count(*) from public.group_wall(pg_temp.get('g'), 'milestone')), 0::bigint,
  'Turning milestone cards off hides them');
select pg_temp.as_user(:m);
update public.privacy_settings set milestone_cards = true where user_id = auth.uid();
select public.update_my_group_membership(pg_temp.get('g'), 'checkin_only', false);
select pg_temp.as_user(:o);
select is((select count(*) from public.posts where kind = 'milestone' and author_id = :m and group_id = pg_temp.get('g')),
  0::bigint, '... and so does sharing only check-ins there, even reading the table directly');

-- ---------------------------------------------------------------- erasure

select pg_temp.as_postgres();
select private.erase_account(:m);
select is((select count(*) from public.nudges where :m in (from_user, to_user)), 0::bigint,
  'Erasing an account removes its nudges');
select is((select count(*) from public.partnerships where :m in (user_a, user_b)), 0::bigint, '... and partnerships');

select * from finish();
rollback;
