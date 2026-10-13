-- Group isolation (CLAUDE.md §2.4, §7.4): a member of group A gets zero rows
-- from group B on every table, and cannot act on group B through any
-- function, whatever their role in A. The table list is discovered, not
-- hard-coded: every table or view in public with a group_id column (and
-- groups itself) is checked, so tables added in later phases are covered
-- automatically. Functions are listed, and a meta-test fails when a new
-- function that takes a group (p_group) or a group-scoped id is not.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

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
create function pg_temp.ga() returns uuid language sql as $$ select current_setting('test.ga')::uuid $$;
create function pg_temp.gb() returns uuid language sql as $$ select current_setting('test.gb')::uuid $$;
create function pg_temp.add_member(gid uuid, uid uuid, r text default 'member') returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (gid, uid, r, 'active', 'full', now(), now());
$$;

-- Group A: owner, admin, member. Group B: owner, member, someone pending, an
-- invite and an open covenant change with one agreement.
select pg_temp.make_user('00000000-0000-7000-8000-000000000a01', 'iso-a-owner@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000a02', 'iso-a-admin@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000a03', 'iso-a-member@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000b01', 'iso-b-owner@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000b02', 'iso-b-member@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000b03', 'iso-b-pending@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000b04', 'iso-b-member2@example.test');

select pg_temp.as_user('00000000-0000-7000-8000-000000000a01');
select set_config('test.ga', public.create_group('Group A', null, '30', null, current_date, 'UTC', 50, 'invite_only',
                  'A covenant for group A.', 'checkin_only', true, 'full')::text, true);
select public.create_group_invite(pg_temp.ga(), repeat('1', 64), repeat('2', 64), 7, null);
select pg_temp.as_user('00000000-0000-7000-8000-000000000b01');
select set_config('test.gb', public.create_group('Group B', null, '30', null, current_date, 'UTC', 50,
                  'request_to_join', 'A covenant for group B.', 'checkin_only', true, 'full')::text, true);
select public.create_group_invite(pg_temp.gb(), repeat('3', 64), repeat('4', 64), 7, null);

select pg_temp.as_postgres();
select pg_temp.add_member(pg_temp.ga(), '00000000-0000-7000-8000-000000000a02', 'admin');
select pg_temp.add_member(pg_temp.ga(), '00000000-0000-7000-8000-000000000a03');
select pg_temp.add_member(pg_temp.gb(), '00000000-0000-7000-8000-000000000b02');
select pg_temp.add_member(pg_temp.gb(), '00000000-0000-7000-8000-000000000b04');
insert into public.group_members (group_id, user_id, status, share_level, covenant_accepted_at)
values (pg_temp.gb(), '00000000-0000-7000-8000-000000000b03', 'pending', 'full', now());
select pg_temp.as_user('00000000-0000-7000-8000-000000000b01');
select public.change_group_covenant(pg_temp.gb(), 'A stricter covenant for group B.', 'full', false);
select pg_temp.as_user('00000000-0000-7000-8000-000000000b02');
select public.agree_to_covenant_change((select id from public.group_covenant_proposals limit 1));
select pg_temp.as_postgres();
select set_config('test.pb', (select id::text from public.group_covenant_proposals where group_id = pg_temp.gb()), true);
select set_config('test.ib', (select id::text from public.group_invites where group_id = pg_temp.gb()), true);
-- Phase 5b: XP that belongs to group B (finishing its challenge).
insert into public.xp_ledger (user_id, group_id, local_date, reason, points, source_key, revision)
values ('00000000-0000-7000-8000-000000000b01', pg_temp.gb(), current_date, 'challenge_finished', 100,
        'challenge_finished:test-b', 1);

-- Phase 5c: a goal and stored leaderboard rows in group B.
insert into public.group_goals (group_id, period, target) values (pg_temp.gb(), 'month', 100);
select private.refresh_leaderboard(pg_temp.gb());

-- Phase 6a: a post, a comment, a reaction and a report in group B.
select pg_temp.as_user('00000000-0000-7000-8000-000000000b02');
select set_config('test.postb', public.create_post(pg_temp.gb(), 'prayer_request', 'Group B only.')::text, true);
select pg_temp.as_user('00000000-0000-7000-8000-000000000b01');
select set_config('test.commentb', public.create_comment(current_setting('test.postb')::uuid, 'B''s comment.')::text, true);
select public.set_reaction('post', current_setting('test.postb')::uuid, 'pray', true);
select pg_temp.as_user('00000000-0000-7000-8000-000000000b04');
select set_config('test.reportb', public.report_content(pg_temp.gb(), 'post', current_setting('test.postb')::uuid,
                                                        'spam')::text, true);
select pg_temp.as_postgres();
-- Phase 6b: a nudge and a partnership request in group B.
select pg_temp.as_user('00000000-0000-7000-8000-000000000b01');
select public.send_nudge(pg_temp.gb(), '00000000-0000-7000-8000-000000000b02', 'praying');
select set_config('test.partnerb', public.request_partner(pg_temp.gb(), '00000000-0000-7000-8000-000000000b02')::text, true);
select pg_temp.as_postgres();
-- Phase 7b: the worker turns those events into notifications.
select private.run_notify(1000, true);

-- The tables to check: groups, plus everything in public with a group_id.
create temp table iso_tables as
select 'groups'::text as tbl, 'id'::text as col
union all
select c.table_name, 'group_id'
  from information_schema.columns c
 where c.table_schema = 'public' and c.column_name = 'group_id';
grant select on iso_tables to authenticated;

select ok((select count(*) from iso_tables) >= 5, 'At least the five group tables are checked');
select ok((select count(*) from iso_tables where tbl in ('group_checkins_today', 'group_member_stats')) = 2,
  'Phase 4''s share-level view and challenge stats are among them');
select ok(exists (select 1 from iso_tables where tbl = 'xp_ledger'), 'Phase 5b''s XP ledger is among them');
select ok((select count(*) from iso_tables where tbl in ('leaderboard_entries', 'group_goals')) = 2,
  'Phase 5c''s stored boards and goals are among them');
select ok((select count(*) from iso_tables where tbl in ('posts', 'comments', 'reactions', 'reports')) = 4,
  'Phase 6a''s wall, reactions and reports are among them');
select ok((select count(*) from iso_tables where tbl in ('nudges', 'partnerships')) = 2,
  'Phase 6b''s nudges and partnerships are among them');
select ok(exists (select 1 from iso_tables where tbl = 'notifications'), 'Phase 7b''s notifications are among them');

-- Counts, as the current role, the rows of group `gid` in every table.
create function pg_temp.visible_rows(gid uuid)
returns table (tbl text, n bigint) language plpgsql as $$
declare r record;
begin
  for r in select * from iso_tables order by 1 loop
    tbl := r.tbl;
    execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into n using gid;
    return next;
  end loop;
end;
$$;

-- Sanity: B's own members do see B's rows.
select pg_temp.as_user('00000000-0000-7000-8000-000000000b01');
select ok((select bool_and(n > 0) from pg_temp.visible_rows(pg_temp.gb())
            where tbl in ('groups', 'group_members', 'group_invites', 'group_covenant_proposals',
                          'group_covenant_agreements', 'group_checkins_today', 'group_member_stats', 'xp_ledger',
                          'leaderboard_entries', 'group_goals', 'posts', 'comments', 'reactions', 'reports', 'nudges', 'partnerships',
                          'notifications')),
  'B''s owner sees B''s rows in every group table (the check below is meaningful)');

-- ---------------------------------------------------------------- reading
select pg_temp.as_user('00000000-0000-7000-8000-000000000a01');
select is((select sum(n) from pg_temp.visible_rows(pg_temp.gb())), 0::numeric,
  'A''s owner sees zero rows of group B, in every table');
select is((select count(*) from public.profile_cards where id in ('00000000-0000-7000-8000-000000000b01',
  '00000000-0000-7000-8000-000000000b02', '00000000-0000-7000-8000-000000000b03')), 0::bigint,
  '... and no profile card of B''s people');
select pg_temp.as_user('00000000-0000-7000-8000-000000000a02');
select is((select sum(n) from pg_temp.visible_rows(pg_temp.gb())), 0::numeric,
  'A''s admin sees zero rows of group B, in every table');
select pg_temp.as_user('00000000-0000-7000-8000-000000000a03');
select is((select sum(n) from pg_temp.visible_rows(pg_temp.gb())), 0::numeric,
  'A''s member sees zero rows of group B, in every table');
select is((select count(*) from public.groups), 1::bigint, 'A''s member sees exactly one group: their own');
select pg_temp.as_user('00000000-0000-7000-8000-000000000b03');
select is((select sum(n) from pg_temp.visible_rows(pg_temp.ga())), 0::numeric,
  'Someone waiting to join B sees nothing of A');

-- ---------------------------------------------------------------- acting
-- A's owner and admin try every group function against B.
create temp table iso_calls (fn text, sql text);
insert into iso_calls values
  ('update_group_details', $$ select public.update_group_details(pg_temp.gb(), 'Taken', null) $$),
  ('update_group_challenge', $$ select public.update_group_challenge(pg_temp.gb(), '30', null, current_date, 'UTC', 50, 'invite_only') $$),
  ('change_group_covenant', $$ select public.change_group_covenant(pg_temp.gb(), 'Something else entirely.', 'checkin_only', true) $$),
  ('agree_to_covenant_change', $$ select public.agree_to_covenant_change(current_setting('test.pb')::uuid) $$),
  ('decline_covenant_change', $$ select public.decline_covenant_change(current_setting('test.pb')::uuid) $$),
  ('withdraw_covenant_change', $$ select public.withdraw_covenant_change(current_setting('test.pb')::uuid) $$),
  ('archive_group', $$ select public.archive_group(pg_temp.gb()) $$),
  ('unarchive_group', $$ select public.unarchive_group(pg_temp.gb()) $$),
  ('delete_group', $$ select public.delete_group(pg_temp.gb(), 'Group B') $$),
  ('transfer_group_ownership', $$ select public.transfer_group_ownership(pg_temp.gb(), '00000000-0000-7000-8000-000000000a01') $$),
  ('set_group_member_role', $$ select public.set_group_member_role(pg_temp.gb(), '00000000-0000-7000-8000-000000000b02', 'admin') $$),
  ('remove_group_member', $$ select public.remove_group_member(pg_temp.gb(), '00000000-0000-7000-8000-000000000b02') $$),
  ('allow_group_member_back', $$ select public.allow_group_member_back(pg_temp.gb(), '00000000-0000-7000-8000-000000000b02') $$),
  ('approve_join_request', $$ select public.approve_join_request(pg_temp.gb(), '00000000-0000-7000-8000-000000000b03') $$),
  ('decline_join_request', $$ select public.decline_join_request(pg_temp.gb(), '00000000-0000-7000-8000-000000000b03') $$),
  ('leave_group', $$ select public.leave_group(pg_temp.gb()) $$),
  ('update_my_group_membership', $$ select public.update_my_group_membership(pg_temp.gb(), 'full', false) $$),
  ('set_group_picture_pending', $$ select public.set_group_picture_pending(pg_temp.gb(), pg_temp.gb()::text || '/aaaaaaaaaaaaaaaaaaaaaa') $$),
  ('remove_group_picture', $$ select public.remove_group_picture(pg_temp.gb()) $$),
  ('create_group_invite', $$ select public.create_group_invite(pg_temp.gb(), repeat('5', 64), repeat('6', 64), 7, null) $$),
  ('revoke_group_invite', $$ select public.revoke_group_invite(current_setting('test.ib')::uuid) $$),
  -- Phase 5c: boards, the Together total, the goal and invite details.
  ('group_leaderboard', $$ select * from public.group_leaderboard(pg_temp.gb()) $$),
  ('group_together', $$ select public.group_together(pg_temp.gb()) $$),
  ('set_group_goal', $$ select public.set_group_goal(pg_temp.gb(), 'month', 500) $$),
  ('end_group_goal', $$ select public.end_group_goal(pg_temp.gb()) $$),
  ('group_invite_people', $$ select * from public.group_invite_people(current_setting('test.ib')::uuid) $$),
  -- Phase 6a: the wall, reactions and reports.
  ('create_post', $$ select public.create_post(pg_temp.gb(), 'encouragement', 'Hello B') $$),
  ('edit_post', $$ select public.edit_post(current_setting('test.postb')::uuid, 'Changed') $$),
  ('delete_post', $$ select public.delete_post(current_setting('test.postb')::uuid) $$),
  ('pin_post', $$ select public.pin_post(current_setting('test.postb')::uuid, true) $$),
  ('create_comment', $$ select public.create_comment(current_setting('test.postb')::uuid, 'Hi') $$),
  ('edit_comment', $$ select public.edit_comment(current_setting('test.commentb')::uuid, 'Changed') $$),
  ('delete_comment', $$ select public.delete_comment(current_setting('test.commentb')::uuid) $$),
  ('set_reaction', $$ select public.set_reaction('post', current_setting('test.postb')::uuid, 'heart', true) $$),
  ('report_content', $$ select public.report_content(pg_temp.gb(), 'post', current_setting('test.postb')::uuid, 'spam') $$),
  ('group_reports', $$ select * from public.group_reports(pg_temp.gb()) $$),
  ('resolve_report', $$ select public.resolve_report(current_setting('test.reportb')::uuid, 'dismissed') $$),
  ('group_wall', $$ select * from public.group_wall(pg_temp.gb()) $$),
  ('wall_post', $$ select * from public.wall_post(current_setting('test.postb')::uuid) $$),
  ('post_comments', $$ select * from public.post_comments(current_setting('test.postb')::uuid) $$),
  -- Phase 6b: nudges and partners.
  ('send_nudge', $$ select public.send_nudge(pg_temp.gb(), '00000000-0000-7000-8000-000000000b02', 'got_this') $$),
  ('group_nudge_targets', $$ select * from public.group_nudge_targets(pg_temp.gb()) $$),
  ('my_nudges', $$ select * from public.my_nudges(pg_temp.gb()) $$),
  ('set_group_nudges_muted', $$ select public.set_group_nudges_muted(pg_temp.gb(), true) $$),
  ('request_partner', $$ select public.request_partner(pg_temp.gb(), '00000000-0000-7000-8000-000000000b02') $$),
  ('respond_partner', $$ select public.respond_partner(current_setting('test.partnerb')::uuid, true) $$),
  ('end_partnership', $$ select public.end_partnership(current_setting('test.partnerb')::uuid) $$),
  ('set_partner_alerts', $$ select public.set_partner_alerts(current_setting('test.partnerb')::uuid, true) $$),
  ('my_partnerships', $$ select * from public.my_partnerships(pg_temp.gb()) $$),
  -- Phase 6c: live updates and reactions on check-ins.
  ('group_live_topic', $$ select public.group_live_topic(pg_temp.gb()) $$),
  ('group_checkin_reactions', $$ select * from public.group_checkin_reactions(pg_temp.gb()) $$),
  ('react_to_checkin', $$ select public.react_to_checkin(pg_temp.gb(), gen_random_uuid(), 'heart', true) $$),
  -- Phase 7b: notifications.
  ('set_group_notifications_muted', $$ select public.set_group_notifications_muted(pg_temp.gb(), true) $$),
  ('send_partner_sos', $$ select public.send_partner_sos(pg_temp.gb()) $$);
grant select on iso_calls to authenticated;

create function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end;
$$;

select pg_temp.as_user('00000000-0000-7000-8000-000000000a01');
select is((select array_agg(fn order by fn) from iso_calls where not pg_temp.refused(sql)), null::text[],
  'A''s owner is refused (42501) by every group function aimed at group B');
select pg_temp.as_user('00000000-0000-7000-8000-000000000a02');
select is((select array_agg(fn order by fn) from iso_calls where not pg_temp.refused(sql)), null::text[],
  'A''s admin is refused by every group function aimed at group B');

select pg_temp.as_postgres();
select results_eq($$ select name, archived_at, member_count, (select count(*) from public.group_invites where group_id = g.id
                            and revoked_at is null) from public.groups g where id = pg_temp.gb() $$,
  $$ values ('Group B'::text, null::timestamptz, 3, 1::bigint) $$, 'Group B is untouched');
select is((select count(*) from public.group_members where group_id = pg_temp.gb()), 4::bigint,
  'B''s memberships are untouched');
select is((select closed_at from public.group_covenant_proposals where id = current_setting('test.pb')::uuid),
  null::timestamptz, 'B''s covenant change is untouched');
select is((select target from public.group_goals where group_id = pg_temp.gb()), 100, 'B''s goal is untouched');
select ok((select p.body = 'Group B only.' and p.deleted_at is null and not p.pinned
             and (select count(*) from public.comments c where c.post_id = p.id and c.deleted_at is null) = 1
             and (select count(*) from public.reactions r where r.target_id = p.id) = 1
             and (select status from public.reports where id = current_setting('test.reportb')::uuid) = 'open'
             and (select status from public.partnerships where id = current_setting('test.partnerb')::uuid) = 'pending'
             and (select count(*) from public.nudges where group_id = p.group_id) = 1
             from public.posts p where p.id = current_setting('test.postb')::uuid),
  'B''s wall, comments, reactions and reports are untouched');

-- Every function that takes a group or a group-scoped id is in the list
-- above (or is a known exception that takes an invite hash instead).
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proargnames && array['p_group', 'p_proposal', 'p_invite', 'p_post', 'p_comment', 'p_target',
                                   'p_report', 'p_partnership']::text[] $$,
  $$ select fn from iso_calls $$,
  'Every public function taking a group, proposal, invite, post, comment, target or report id is covered by the isolation test');

select * from finish();
rollback;
