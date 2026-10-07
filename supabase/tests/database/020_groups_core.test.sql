begin;
create extension if not exists pgtap with schema extensions;

select plan(91);

-- People, created through the real sign-up path, with verified emails.
create function pg_temp.make_user(id uuid, email text, verified boolean default true) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
          case when verified then now() end,
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
create function pg_temp.add_member(gid uuid, uid uuid, st text default 'active', r text default 'member')
returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (gid, uid, r, st, 'checkin_only', now(), case when st = 'active' then now() - interval '1 day' end);
$$;

-- o owner, a admin, m and n members, p pending, x outsider, u unverified
select pg_temp.make_user('00000000-0000-7000-8000-000000000201', 'g-owner@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000202', 'g-admin@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000203', 'g-member@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000204', 'g-member2@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000205', 'g-pending@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000206', 'g-outsider@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000207', 'g-unverified@example.test', false);

-- ---------------------------------------------------------------- create
select pg_temp.as_user('00000000-0000-7000-8000-000000000207');
select throws_ok($$ select public.create_group('Unverified', null, '30', null, current_date, 'UTC', 50, 'invite_only',
                   'We walk together in grace.', 'checkin_only', true, 'checkin_only') $$,
  'P0001', 'email_unverified', 'An unverified email cannot create a group');

select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select throws_ok($$ select public.create_group('Bad zone', null, '30', null, current_date, 'Mars/Olympus', 50,
                   'invite_only', 'We walk together in grace.', 'checkin_only', true, 'checkin_only') $$,
  'P0001', 'timezone_invalid', 'An unknown time zone is refused');
select throws_ok($$ select public.create_group('Too short', null, 'custom', 3, current_date, 'UTC', 50,
                   'invite_only', 'We walk together in grace.', 'checkin_only', true, 'checkin_only') $$,
  'P0001', 'invalid_input', 'A custom challenge is at least 7 days');
select throws_ok($$ select public.create_group('Far away', null, '30', null, current_date + 800, 'UTC', 50,
                   'invite_only', 'We walk together in grace.', 'checkin_only', true, 'checkin_only') $$,
  'P0001', 'start_date_out_of_range', 'A start date more than a year away is refused');
select throws_ok($$ select public.create_group('Shy owner', null, '30', null, current_date, 'UTC', 50,
                   'invite_only', 'We walk together in grace.', 'streak', true, 'checkin_only') $$,
  '23514', 'share_level_too_low', 'The owner shares at least the group''s minimum too');

select lives_ok($$ select set_config('test.g', public.create_group('  Iron Sharpens  ', 'Proverbs 27:17', '30', null,
                   current_date, 'Asia/Kolkata', 10, 'invite_only', 'We walk together in grace.', 'checkin_only',
                   true, 'streak')::text, true) $$,
  'A verified person creates a group');
select is((select name from public.groups where id = pg_temp.g()), 'Iron Sharpens', 'The name is trimmed');
select is((select end_date - start_date from public.groups where id = pg_temp.g()), 29,
  'A 30-day challenge ends on its 30th day');
select ok((select slug ~ '^iron-sharpens-[0-9a-f]{10}$' from public.groups where id = pg_temp.g()),
  'The slug is generated from the name plus random characters');
select results_eq($$ select role, status, share_level from public.group_members where group_id = pg_temp.g() $$,
  $$ values ('owner'::text, 'active'::text, 'streak'::text) $$, 'The creator is its active owner');
select is((select member_count from public.groups where id = pg_temp.g()), 1, 'member_count starts at 1');

-- ---------------------------------------------------------------- no direct writes
select throws_ok($$ insert into public.groups (name, slug, owner_id, challenge_type, start_date, group_timezone,
                   covenant_text) values ('Sneaky', 'sneaky', auth.uid(), 'ongoing', current_date, 'UTC',
                   'We walk together.') $$, '42501', null, 'Nobody inserts groups directly');
select throws_ok($$ update public.groups set name = 'Renamed' where id = pg_temp.g() $$, '42501', null,
  'Not even the owner updates a group directly');
select throws_ok($$ update public.group_members set role = 'admin' $$, '42501', null,
  'Nobody updates memberships directly');
select throws_ok($$ insert into public.group_members (group_id, user_id, status, share_level)
                   values (pg_temp.g(), '00000000-0000-7000-8000-000000000206', 'active', 'full') $$,
  '42501', null, 'Nobody inserts memberships directly');
select throws_ok($$ delete from public.group_members $$, '42501', null, 'Nobody deletes memberships directly');

-- Fill the group (test setup, as the database owner).
select pg_temp.as_postgres();
select pg_temp.add_member(pg_temp.g(), '00000000-0000-7000-8000-000000000202', 'active', 'admin');
select pg_temp.add_member(pg_temp.g(), '00000000-0000-7000-8000-000000000203');
select pg_temp.add_member(pg_temp.g(), '00000000-0000-7000-8000-000000000204');
select pg_temp.add_member(pg_temp.g(), '00000000-0000-7000-8000-000000000205', 'pending');
insert into public.group_invites (group_id, token_hash, code_hash, created_by, expires_at)
values (pg_temp.g(), repeat('a', 64), repeat('b', 64), '00000000-0000-7000-8000-000000000201', now() + interval '7 days');
select is((select member_count from public.groups where id = pg_temp.g()), 4, 'member_count counts active members only');

-- ---------------------------------------------------------------- reading
select pg_temp.as_user('00000000-0000-7000-8000-000000000203');
select is((select count(*) from public.groups), 1::bigint, 'A member sees their group');
select is((select count(*) from public.group_members), 4::bigint, 'A member sees the four active members');
select is((select count(*) from public.group_invites), 0::bigint, 'A member sees no invites');
select throws_ok($$ select token_hash from public.group_invites $$, '42501', null, 'Invite hashes are never readable');
select is((select count(*) from public.profile_cards where id = '00000000-0000-7000-8000-000000000201'), 1::bigint,
  'Members now see each other''s profile cards');
select is((select count(*) from public.profile_cards where id = '00000000-0000-7000-8000-000000000205'), 0::bigint,
  'A member doesn''t see the card of someone asking to join');

select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select is((select count(*) from public.group_members), 5::bigint, 'An admin also sees the pending request');
select is((select count(*) from public.group_invites), 1::bigint, 'An admin sees the group''s invites');
select is((select count(*) from public.profile_cards where id = '00000000-0000-7000-8000-000000000205'), 1::bigint,
  'An admin sees the card of someone asking to join');

select pg_temp.as_user('00000000-0000-7000-8000-000000000205');
select is((select count(*) from public.groups), 1::bigint, 'Someone asking to join sees the group itself');
select results_eq($$ select user_id from public.group_members $$,
  $$ values ('00000000-0000-7000-8000-000000000205'::uuid) $$, '... but only their own membership row');

select pg_temp.as_user('00000000-0000-7000-8000-000000000206');
select is((select count(*) from public.groups), 0::bigint, 'An outsider sees no group');
select is((select count(*) from public.group_members), 0::bigint, 'An outsider sees no members');
select is((select count(*) from public.profile_cards where id = '00000000-0000-7000-8000-000000000203'), 0::bigint,
  'An outsider sees no member''s card');
select throws_ok($$ select public.update_group_details(pg_temp.g(), 'Mine now', null) $$, '42501', 'group_not_found',
  'An outsider cannot touch the group, and learns nothing about it');

-- ---------------------------------------------------------------- details and settings
select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select lives_ok($$ select public.update_group_details(pg_temp.g(), 'Iron Sharpens Iron', 'Together') $$,
  'An admin edits the name and description');
select throws_ok($$ select public.update_group_challenge(pg_temp.g(), '40', null, current_date, 'UTC', 10, 'invite_only') $$,
  '42501', 'group_forbidden', 'An admin cannot change the challenge settings');
select throws_ok($$ select public.change_group_covenant(pg_temp.g(), 'A new covenant for all.', 'full', false) $$,
  '42501', 'group_forbidden', 'An admin cannot change the covenant');

select pg_temp.as_user('00000000-0000-7000-8000-000000000203');
select throws_ok($$ select public.update_group_details(pg_temp.g(), 'Hijacked', null) $$, '42501', 'group_forbidden',
  'A member cannot edit the group');

select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select throws_ok($$ select public.update_group_challenge(pg_temp.g(), '40', null, current_date, 'UTC', 3, 'invite_only') $$,
  'P0001', 'max_members_too_low', 'The cap cannot go below the current members');
select lives_ok($$ select public.update_group_challenge(pg_temp.g(), '40', null, current_date, 'UTC', 20, 'request_to_join') $$,
  'The owner changes the challenge');
select is((select end_date - start_date from public.groups where id = pg_temp.g()), 39, 'The end date follows');

-- ---------------------------------------------------------------- roles
select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select throws_ok($$ select public.set_group_member_role(pg_temp.g(), '00000000-0000-7000-8000-000000000203', 'admin') $$,
  '42501', 'group_forbidden', 'Only the owner promotes');
select throws_ok($$ select public.remove_group_member(pg_temp.g(), '00000000-0000-7000-8000-000000000201') $$,
  '42501', 'group_forbidden', 'Nobody removes the owner');

select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select throws_ok($$ select public.set_group_member_role(pg_temp.g(), '00000000-0000-7000-8000-000000000201', 'member') $$,
  'P0001', 'cannot_target_self', 'The owner cannot demote themselves');
select lives_ok($$ select public.set_group_member_role(pg_temp.g(), '00000000-0000-7000-8000-000000000203', 'admin') $$,
  'The owner promotes a member');
select pg_temp.as_postgres();
select ok(exists (select 1 from public.audit_log where action = 'group.role_changed'
                   and target_id = '00000000-0000-7000-8000-000000000203'
                   and metadata = jsonb_build_object('from', 'member', 'to', 'admin', 'group', pg_temp.g())),
  'The role change is audited with ids and roles only');

select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select throws_ok($$ select public.remove_group_member(pg_temp.g(), '00000000-0000-7000-8000-000000000203') $$,
  '42501', 'group_forbidden', 'An admin cannot remove another admin');
select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select lives_ok($$ select public.set_group_member_role(pg_temp.g(), '00000000-0000-7000-8000-000000000203', 'member') $$,
  'The owner demotes them again');

select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select lives_ok($$ select public.remove_group_member(pg_temp.g(), '00000000-0000-7000-8000-000000000204') $$,
  'An admin removes a member');
select is((select member_count from public.groups where id = pg_temp.g()), 3, 'member_count drops');

select pg_temp.as_user('00000000-0000-7000-8000-000000000204');
select is((select count(*) from public.groups), 0::bigint, 'A removed member no longer sees the group');
select results_eq($$ select status from public.group_members $$, $$ values ('removed'::text) $$,
  '... only their own row, marked removed');
select throws_ok($$ select public.leave_group(pg_temp.g()) $$, '42501', 'group_not_found',
  'A removed member has nothing to leave');

select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select lives_ok($$ select public.allow_group_member_back(pg_temp.g(), '00000000-0000-7000-8000-000000000204') $$,
  'An admin allows them back');
select pg_temp.as_postgres();
select is((select count(*) from public.group_members where user_id = '00000000-0000-7000-8000-000000000204'), 0::bigint,
  'The removal is lifted (they may join again with an invite)');

-- ---------------------------------------------------------------- requests
select pg_temp.as_user('00000000-0000-7000-8000-000000000203');
select throws_ok($$ select public.approve_join_request(pg_temp.g(), '00000000-0000-7000-8000-000000000205') $$,
  '42501', 'group_forbidden', 'A member cannot approve requests');
select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select lives_ok($$ select public.approve_join_request(pg_temp.g(), '00000000-0000-7000-8000-000000000205') $$,
  'An admin approves a request');
select is((select status from public.group_members where user_id = '00000000-0000-7000-8000-000000000205'), 'active',
  'The person is now an active member');

-- ---------------------------------------------------------------- my membership
select pg_temp.as_user('00000000-0000-7000-8000-000000000203');
select lives_ok($$ select public.update_my_group_membership(pg_temp.g(), 'full', true) $$,
  'A member shares more and hides from the leaderboard (allowed here)');

-- ---------------------------------------------------------------- covenant
select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select is(public.change_group_covenant(pg_temp.g(), 'We walk together in grace.', 'checkin_only', true), 'unchanged',
  'Saving the same covenant changes nothing');
select is(public.change_group_covenant(pg_temp.g(), 'We walk together in grace.', 'streak', false), 'proposed',
  'Tightening the covenant with others in the group needs their agreement');
select is((select min_share_level from public.groups where id = pg_temp.g()), 'checkin_only',
  '... and doesn''t apply yet');

select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select set_config('test.p', (select id::text from public.group_covenant_proposals where closed_at is null), true);
select is(public.agree_to_covenant_change(current_setting('test.p')::uuid), false, 'One agreement is not enough');
select pg_temp.as_user('00000000-0000-7000-8000-000000000203');
select is(public.agree_to_covenant_change(current_setting('test.p')::uuid), false, 'Two of three is not enough');
select pg_temp.as_user('00000000-0000-7000-8000-000000000205');
select is(public.agree_to_covenant_change(current_setting('test.p')::uuid), true,
  'The last agreement applies the new covenant');
select pg_temp.as_postgres();
select results_eq($$ select min_share_level, leaderboard_hiding_allowed from public.groups where id = pg_temp.g() $$,
  $$ values ('streak'::text, false) $$, 'The tighter covenant is in force');
select is((select count(*) from public.group_members where group_id = pg_temp.g()
            and (util.share_rank(share_level) < 1 or leaderboard_hidden)), 0::bigint,
  'Everyone now shares at least the new minimum, and nobody is hidden');

select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select is(public.change_group_covenant(pg_temp.g(), 'We walk together in grace.', 'checkin_only', true), 'applied',
  'Relaxing the covenant applies at once');
select is(public.change_group_covenant(pg_temp.g(), 'We walk together in grace and truth.', 'checkin_only', true),
  'proposed', 'New covenant text also needs agreement');
select pg_temp.as_user('00000000-0000-7000-8000-000000000203');
select lives_ok($$ select public.decline_covenant_change(
                   (select id from public.group_covenant_proposals where closed_at is null)) $$,
  'Any member may decline');
select pg_temp.as_postgres();
select results_eq($$ select covenant_text from public.groups where id = pg_temp.g() $$,
  $$ values ('We walk together in grace.'::text) $$, 'A declined change leaves the covenant as it was');

-- A member who hasn't agreed leaves: the others' agreement is then enough.
select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select is(public.change_group_covenant(pg_temp.g(), 'We walk together in grace.', 'full', true), 'proposed',
  'Another tightening is proposed');
select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select is(public.agree_to_covenant_change((select id from public.group_covenant_proposals where closed_at is null)),
  false, 'The admin agrees');
select pg_temp.as_user('00000000-0000-7000-8000-000000000205');
select is(public.agree_to_covenant_change((select id from public.group_covenant_proposals where closed_at is null)),
  false, 'Another member agrees');
select pg_temp.as_user('00000000-0000-7000-8000-000000000203');
select lives_ok($$ select public.leave_group(pg_temp.g()) $$, 'The last member who hadn''t agreed leaves');
select pg_temp.as_postgres();
select is((select min_share_level from public.groups where id = pg_temp.g()), 'full',
  'With everyone remaining in agreement, the change applies');
select is((select count(*) from public.group_members where user_id = '00000000-0000-7000-8000-000000000203'), 0::bigint,
  'Leaving deletes the membership row');

-- ---------------------------------------------------------------- ownership, archive, delete
select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select throws_ok($$ select public.leave_group(pg_temp.g()) $$, 'P0001', 'owner_must_transfer',
  'The owner hands the group on before leaving');
select throws_ok($$ select public.transfer_group_ownership(pg_temp.g(), '00000000-0000-7000-8000-000000000206') $$,
  'P0001', 'target_not_member', 'Ownership goes only to an active member');
select lives_ok($$ select public.transfer_group_ownership(pg_temp.g(), '00000000-0000-7000-8000-000000000202') $$,
  'The owner hands the group to the admin');
select pg_temp.as_postgres();
select results_eq($$ select user_id, role from public.group_members
                     where group_id = pg_temp.g() and role in ('owner', 'admin') order by role desc $$,
  $$ values ('00000000-0000-7000-8000-000000000202'::uuid, 'owner'::text),
            ('00000000-0000-7000-8000-000000000201'::uuid, 'admin'::text) $$,
  'The new owner is the owner; the old owner is an admin');
select is((select owner_id from public.groups where id = pg_temp.g()), '00000000-0000-7000-8000-000000000202'::uuid,
  'groups.owner_id follows');

select pg_temp.as_user('00000000-0000-7000-8000-000000000202');
select lives_ok($$ select public.archive_group(pg_temp.g()) $$, 'The owner archives the group');
select throws_ok($$ select public.update_group_details(pg_temp.g(), 'Back again', null) $$, 'P0001', 'group_archived',
  'An archived group is read-only');
select lives_ok($$ select public.unarchive_group(pg_temp.g()) $$, 'and can bring it back');
select throws_ok($$ select public.delete_group(pg_temp.g(), 'Something else') $$, 'P0001', 'name_mismatch',
  'Deleting needs the group''s name typed in');
select lives_ok($$ select public.delete_group(pg_temp.g(), 'iron sharpens iron') $$, 'The owner deletes the group');
select pg_temp.as_postgres();
select is((select count(*) from public.groups where id = pg_temp.g()), 0::bigint, 'The group is gone');
select is((select count(*) from public.group_members where group_id = pg_temp.g()), 0::bigint,
  'with all its memberships');
select is((select count(*) from private.storage_purge_queue where bucket = 'group-pictures' and prefix = pg_temp.g()::text),
  1::bigint, 'Its picture folder is queued for removal');
select ok(exists (select 1 from public.audit_log where action = 'group.deleted' and target_id = pg_temp.g()),
  'The deletion is audited');

-- ---------------------------------------------------------------- closing accounts
select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select set_config('test.g', public.create_group('Second Wind', null, 'ongoing', null, current_date, 'UTC', 50,
                  'invite_only', 'We walk together in grace.', 'checkin_only', true, 'checkin_only')::text, true);
select pg_temp.as_postgres();
select pg_temp.add_member(pg_temp.g(), '00000000-0000-7000-8000-000000000203');
update public.profiles set deletion_requested_at = now() where id = '00000000-0000-7000-8000-000000000203';
select pg_temp.as_user('00000000-0000-7000-8000-000000000201');
select is((select count(*) from public.group_members where group_id = pg_temp.g()), 1::bigint,
  'A member whose account is closing is hidden from the member list');
select is((select end_date from public.groups where id = pg_temp.g()), null::date, 'An ongoing group has no end date');

select * from finish();
rollback;
