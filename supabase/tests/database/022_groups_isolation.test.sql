-- Group isolation (CLAUDE.md §2.4, §7.4): a member of group A gets zero rows
-- from group B on every table, and cannot act on group B through any
-- function, whatever their role in A. The table list is discovered, not
-- hard-coded: every table or view in public with a group_id column (and
-- groups itself) is checked, so tables added in later phases are covered
-- automatically. Functions are listed, and a meta-test fails when a new
-- function that takes a group (p_group) or a group-scoped id is not.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

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

-- The tables to check: groups, plus everything in public with a group_id.
create temp table iso_tables as
select 'groups'::text as tbl, 'id'::text as col
union all
select c.table_name, 'group_id'
  from information_schema.columns c
 where c.table_schema = 'public' and c.column_name = 'group_id';
grant select on iso_tables to authenticated;

select ok((select count(*) from iso_tables) >= 5, 'At least the five group tables are checked');

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
                          'group_covenant_agreements')),
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
  ('revoke_group_invite', $$ select public.revoke_group_invite(current_setting('test.ib')::uuid) $$);
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

-- Every function that takes a group or a group-scoped id is in the list
-- above (or is a known exception that takes an invite hash instead).
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proargnames && array['p_group', 'p_proposal', 'p_invite']::text[] $$,
  $$ select fn from iso_calls $$,
  'Every public function taking a group, proposal or invite id is covered by the isolation test');

select * from finish();
rollback;
