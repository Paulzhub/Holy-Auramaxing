-- What erasing an account does to groups (D-033, D-040):
-- private.anonymise_group_contributions(), run by the daily purge.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

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
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select set_config('role', 'service_role', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.new_group(owner uuid, name text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.as_user(owner);
  v := public.create_group(name, null, 'ongoing', null, current_date, 'UTC', 50, 'invite_only',
                           'We walk together in grace.', 'checkin_only', true, 'checkin_only');
  perform pg_temp.as_postgres();
  return v;
end;
$$;
create function pg_temp.add_member(gid uuid, uid uuid, r text, since interval) returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (gid, uid, r, 'active', 'checkin_only', now(), now() - since);
$$;

-- x is leaving. a: admin (joined recently); m: member (joined long ago); y: another owner.
select pg_temp.make_user('00000000-0000-7000-8000-000000000501', 'erase-x@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000502', 'erase-a@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000503', 'erase-m@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000504', 'erase-y@example.test');

select set_config('test.g1', pg_temp.new_group('00000000-0000-7000-8000-000000000501', 'Has an admin')::text, true);
select set_config('test.g2', pg_temp.new_group('00000000-0000-7000-8000-000000000501', 'Has a member')::text, true);
select set_config('test.g3', pg_temp.new_group('00000000-0000-7000-8000-000000000501', 'Only x')::text, true);
select set_config('test.g4', pg_temp.new_group('00000000-0000-7000-8000-000000000504', 'Owned by y')::text, true);

select pg_temp.add_member(current_setting('test.g1')::uuid, '00000000-0000-7000-8000-000000000502', 'admin', '1 day');
select pg_temp.add_member(current_setting('test.g1')::uuid, '00000000-0000-7000-8000-000000000503', 'member', '300 days');
select pg_temp.add_member(current_setting('test.g2')::uuid, '00000000-0000-7000-8000-000000000503', 'member', '5 days');
select pg_temp.add_member(current_setting('test.g4')::uuid, '00000000-0000-7000-8000-000000000501', 'member', '5 days');
select pg_temp.add_member(current_setting('test.g4')::uuid, '00000000-0000-7000-8000-000000000503', 'member', '5 days');

select pg_temp.as_user('00000000-0000-7000-8000-000000000501');
select public.create_group_invite(current_setting('test.g1')::uuid, repeat('1', 64), repeat('2', 64), 7, null);
-- y proposes a tighter covenant in g4; m agrees, x never does.
select pg_temp.as_user('00000000-0000-7000-8000-000000000504');
select public.change_group_covenant(current_setting('test.g4')::uuid, 'We walk together in grace.', 'full', true);
select pg_temp.as_user('00000000-0000-7000-8000-000000000503');
select public.agree_to_covenant_change((select id from public.group_covenant_proposals
                                         where group_id = current_setting('test.g4')::uuid));

-- x's grace period ends.
select pg_temp.as_postgres();
update public.profiles set deletion_requested_at = now() - interval '15 days'
 where id = '00000000-0000-7000-8000-000000000501';
select pg_temp.as_service();
select is(public.run_account_purge(), 1, 'x''s account is erased');

select pg_temp.as_postgres();
select is((select owner_id from public.groups where id = current_setting('test.g1')::uuid),
  '00000000-0000-7000-8000-000000000502'::uuid, 'An owned group passes to its admin before any member');
select is((select role from public.group_members
            where group_id = current_setting('test.g1')::uuid and user_id = '00000000-0000-7000-8000-000000000502'),
  'owner', '... who is now its owner');
select is((select owner_id from public.groups where id = current_setting('test.g2')::uuid),
  '00000000-0000-7000-8000-000000000503'::uuid, 'With no admin, it passes to the longest-serving member');
select is((select count(*) from public.groups where id = current_setting('test.g3')::uuid), 0::bigint,
  'A group with nobody else in it is deleted');
select is((select count(*) from private.storage_purge_queue
            where bucket = 'group-pictures' and prefix = current_setting('test.g3')::text), 1::bigint,
  '... and its picture folder queued for removal');
select is((select count(*) from public.group_members where user_id = '00000000-0000-7000-8000-000000000501'), 0::bigint,
  'x''s memberships are gone');
select is((select count(*) from public.group_invites where token_hash = repeat('1', 64)), 0::bigint,
  'The invites x created are gone');
select is((select member_count from public.groups where id = current_setting('test.g4')::uuid), 2,
  'The other group''s member count follows');
select results_eq($$ select min_share_level from public.groups where id = current_setting('test.g4')::uuid $$,
  $$ values ('full'::text) $$, 'A covenant change x hadn''t agreed to now has everyone''s agreement and applies');
select ok(exists (select 1 from public.audit_log where action = 'group.ownership_transferred' and actor_id is null
                   and target_id = '00000000-0000-7000-8000-000000000502'),
  'The hand-over is audited, by nobody');
select is((select count(*) from public.audit_log where actor_id = '00000000-0000-7000-8000-000000000501'
            or target_id = '00000000-0000-7000-8000-000000000501'), 0::bigint, 'No audit row points at x');
select is((select count(*) from public.audit_log
            where metadata ->> 'group' is not null and metadata::text like '%00000000-0000-7000-8000-000000000501%'),
  0::bigint, 'and no audit metadata names x either');
select is((select count(*) from public.group_members m join public.groups g on g.id = m.group_id
            where m.role = 'owner' and g.owner_id <> m.user_id), 0::bigint,
  'Every group''s owner row matches groups.owner_id');
select is((select count(*) from public.groups g
            where (select count(*) from public.group_members m where m.group_id = g.id and m.role = 'owner') <> 1),
  0::bigint, 'Every group still has exactly one owner');

select * from finish();
rollback;
