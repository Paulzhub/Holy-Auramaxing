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
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.h(t text) returns text language sql as $$ select repeat(t, 64) $$;
create function pg_temp.g() returns uuid language sql as $$ select current_setting('test.g')::uuid $$;
create function pg_temp.seen() returns timestamptz language sql security definer as $$
  select covenant_updated_at from public.groups where id = current_setting('test.g')::uuid
$$;

select pg_temp.make_user('00000000-0000-7000-8000-000000000301', 'i-owner@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000302', 'i-admin@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000303', 'i-joiner@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000304', 'i-joiner2@example.test');
select pg_temp.make_user('00000000-0000-7000-8000-000000000305', 'i-joiner3@example.test');

select pg_temp.as_user('00000000-0000-7000-8000-000000000301');
select set_config('test.g', public.create_group('Morning Light', 'Lamentations 3:23', '90', null, current_date, 'UTC', 3,
                  'invite_only', 'We pray for one another daily.', 'streak', false, 'streak')::text, true);

-- ---------------------------------------------------------------- creating
select lives_ok($$ select public.create_group_invite(pg_temp.g(), pg_temp.h('1'), pg_temp.h('2'), 7, null) $$,
  'The owner creates an invite');
select throws_ok($$ select public.create_group_invite(pg_temp.g(), pg_temp.h('3'), pg_temp.h('4'), 60, null) $$,
  'P0001', 'invalid_input', 'Invites last at most 30 days');
select pg_temp.as_user('00000000-0000-7000-8000-000000000303');
select throws_ok($$ select public.create_group_invite(pg_temp.g(), pg_temp.h('5'), pg_temp.h('6'), 7, null) $$,
  '42501', 'group_not_found', 'Someone outside the group cannot create invites');

-- ---------------------------------------------------------------- preview
select pg_temp.as_anon();
select results_eq($$ select * from public.preview_group_invite(pg_temp.h('1')) $$,
  $$ values ('valid'::text, 'Morning Light'::text, 1) $$,
  'Signed out, the link shows only the group''s name and member count');
select results_eq($$ select * from public.preview_group_invite(null, pg_temp.h('2')) $$,
  $$ values ('valid'::text, 'Morning Light'::text, 1) $$, 'The short code finds the same invite');
select results_eq($$ select * from public.preview_group_invite(pg_temp.h('9')) $$,
  $$ values ('invalid'::text, null::text, null::integer) $$, 'An unknown link reveals nothing');
select throws_ok($$ select * from public.group_invite_details(pg_temp.h('1')) $$, '42501', null,
  'The covenant and details need a signed-in person');
select throws_ok($$ select * from public.join_group(pg_temp.h('1'), null, 'full', false, true, now()) $$, '42501', null,
  'Signed-out visitors cannot join');

select pg_temp.as_user('00000000-0000-7000-8000-000000000303');
select results_eq($$ select status, group_name, covenant_text, min_share_level, leaderboard_hiding_allowed, join_policy,
                            my_status from public.group_invite_details(pg_temp.h('1')) $$,
  $$ values ('valid'::text, 'Morning Light'::text, 'We pray for one another daily.'::text, 'streak'::text, false,
             'invite_only'::text, null::text) $$,
  'Signed in, the person sees the covenant and the accountability level before joining');

-- ---------------------------------------------------------------- joining
select throws_ok($$ select * from public.join_group(pg_temp.h('1'), null, 'full', false, false, pg_temp.seen()) $$,
  'P0001', 'covenant_not_accepted', 'Joining needs the covenant accepted');
select throws_ok($$ select * from public.join_group(pg_temp.h('1'), null, 'checkin_only', false, true, pg_temp.seen()) $$,
  'P0001', 'share_level_too_low', 'A member may not share less than the minimum');
select throws_ok($$ select * from public.join_group(pg_temp.h('1'), null, 'full', true, true, pg_temp.seen()) $$,
  'P0001', 'hiding_not_allowed', 'Nor hide from the leaderboard where the group doesn''t allow it');
select throws_ok($$ select * from public.join_group(pg_temp.h('1'), null, 'full', false, true,
                   pg_temp.seen() - interval '1 hour') $$,
  'P0001', 'covenant_changed', 'A covenant changed since it was read must be read again');
select results_eq($$ select * from public.join_group(pg_temp.h('1'), null, 'full', false, true, pg_temp.seen()) $$,
  $$ values ('active'::text, pg_temp.g()) $$, 'They may share more than the minimum, and join at once');
select throws_ok($$ select * from public.join_group(pg_temp.h('1'), null, 'full', false, true, pg_temp.seen()) $$,
  'P0001', 'group_already_member', 'Joining twice is refused kindly');
select results_eq($$ select status, group_id, my_status from public.group_invite_details(pg_temp.h('1')) $$,
  $$ values ('valid'::text, pg_temp.g(), 'active'::text) $$,
  'A member following the link again is pointed to the group');
select is((select count(*) from public.groups), 1::bigint, 'The new member sees the group');

select pg_temp.as_postgres();
select results_eq($$ select use_count, (select member_count from public.groups where id = pg_temp.g())
                     from public.group_invites where token_hash = pg_temp.h('1') $$,
  $$ values (1, 2) $$, 'The invite counts the use, and the group the member');
select ok(exists (select 1 from public.audit_log where action = 'group.member_joined'
                   and actor_id = '00000000-0000-7000-8000-000000000303' and target_id = pg_temp.g()),
  'Joining is audited');
select is((select invite_id from public.group_members where user_id = '00000000-0000-7000-8000-000000000303'),
  (select id from public.group_invites where token_hash = pg_temp.h('1')), 'The membership records the invite used');

-- ---------------------------------------------------------------- refusals
-- Used up: max 1 use.
select pg_temp.as_user('00000000-0000-7000-8000-000000000301');
select lives_ok($$ select public.create_group_invite(pg_temp.g(), pg_temp.h('a'), pg_temp.h('b'), 7, 1) $$,
  'An invite for one use');
select pg_temp.as_user('00000000-0000-7000-8000-000000000304');
select lives_ok($$ select * from public.join_group(null, pg_temp.h('b'), 'streak', false, true, pg_temp.seen()) $$,
  'Joining with the short code');
select pg_temp.as_user('00000000-0000-7000-8000-000000000305');
select is((select status from public.preview_group_invite(pg_temp.h('a'))), 'used_up', 'The invite is now used up');
select throws_ok($$ select * from public.join_group(pg_temp.h('a'), null, 'streak', false, true, pg_temp.seen()) $$,
  'P0001', 'invite_used_up', 'A used-up invite is refused');

-- Full: the cap is 3 and there are 3 members.
select is((select status from public.preview_group_invite(pg_temp.h('1'))), 'full', 'The group is full');
select throws_ok($$ select * from public.join_group(pg_temp.h('1'), null, 'streak', false, true, pg_temp.seen()) $$,
  'P0001', 'group_full', 'A full group is refused');

-- Expired and revoked.
select pg_temp.as_postgres();
update public.groups set max_members = 10 where id = pg_temp.g();
insert into public.group_invites (group_id, token_hash, code_hash, created_by, expires_at)
values (pg_temp.g(), pg_temp.h('c'), pg_temp.h('d'), '00000000-0000-7000-8000-000000000301', now() - interval '1 minute');
select pg_temp.as_user('00000000-0000-7000-8000-000000000305');
select is((select status from public.preview_group_invite(pg_temp.h('c'))), 'expired', 'An old invite shows as expired');
select throws_ok($$ select * from public.join_group(pg_temp.h('c'), null, 'streak', false, true, pg_temp.seen()) $$,
  'P0001', 'invite_expired', 'An expired invite is refused');

select pg_temp.as_user('00000000-0000-7000-8000-000000000303');
select throws_ok($$ select public.revoke_group_invite((select id from public.group_invites limit 1)) $$,
  '42501', null, 'A member cannot revoke invites (they can''t even see them)');
select pg_temp.as_user('00000000-0000-7000-8000-000000000301');
select lives_ok($$ select public.revoke_group_invite((select id from public.group_invites where expires_at > now()
                                                      and max_uses is null)) $$, 'The owner revokes the first invite');
select pg_temp.as_user('00000000-0000-7000-8000-000000000305');
select is((select status from public.preview_group_invite(pg_temp.h('1'))), 'revoked', 'It shows as revoked');
select throws_ok($$ select * from public.join_group(pg_temp.h('1'), null, 'streak', false, true, pg_temp.seen()) $$,
  'P0001', 'invite_revoked', 'A revoked invite is refused');
select throws_ok($$ select * from public.join_group(pg_temp.h('f'), null, 'streak', false, true, pg_temp.seen()) $$,
  'P0001', 'invite_invalid', 'An unknown invite is refused');

-- Archived.
select pg_temp.as_user('00000000-0000-7000-8000-000000000301');
select lives_ok($$ select public.create_group_invite(pg_temp.g(), pg_temp.h('e'), pg_temp.h('0'), 7, null) $$,
  'A fresh invite');
select lives_ok($$ select public.archive_group(pg_temp.g()) $$, 'The group is archived');
select throws_ok($$ select public.create_group_invite(pg_temp.g(), pg_temp.h('7'), pg_temp.h('8'), 7, null) $$,
  'P0001', 'group_archived', 'An archived group makes no invites');
select pg_temp.as_user('00000000-0000-7000-8000-000000000305');
select throws_ok($$ select * from public.join_group(pg_temp.h('e'), null, 'streak', false, true, pg_temp.seen()) $$,
  'P0001', 'group_archived', 'An archived group takes no new members');
select pg_temp.as_user('00000000-0000-7000-8000-000000000301');
select lives_ok($$ select public.unarchive_group(pg_temp.g()) $$, 'Back in use');

-- ---------------------------------------------------------------- approval
select lives_ok($$ select public.update_group_challenge(pg_temp.g(), '90', null, current_date, 'UTC', 10,
                   'request_to_join') $$, 'The group now approves new members');
select pg_temp.as_user('00000000-0000-7000-8000-000000000305');
select results_eq($$ select status from public.join_group(pg_temp.h('e'), null, 'streak', false, true, pg_temp.seen()) $$,
  $$ values ('pending'::text) $$, 'Joining makes a request');
select throws_ok($$ select * from public.join_group(pg_temp.h('e'), null, 'streak', false, true, pg_temp.seen()) $$,
  'P0001', 'group_already_requested', 'Asking twice is refused kindly');
select is((select count(*) from public.group_members), 1::bigint, 'While waiting, they see only their own row');
select pg_temp.as_postgres();
select is((select member_count from public.groups where id = pg_temp.g()), 3, 'A request is not a member yet');

-- A removed member can't come back by invite until allowed.
select pg_temp.as_user('00000000-0000-7000-8000-000000000301');
select lives_ok($$ select public.decline_join_request(pg_temp.g(), '00000000-0000-7000-8000-000000000305') $$,
  'The owner declines the request');
select lives_ok($$ select public.remove_group_member(pg_temp.g(), '00000000-0000-7000-8000-000000000304') $$,
  'The owner removes a member');
select pg_temp.as_user('00000000-0000-7000-8000-000000000304');
select throws_ok($$ select * from public.join_group(pg_temp.h('e'), null, 'streak', false, true, pg_temp.seen()) $$,
  'P0001', 'group_removed', 'A removed member cannot rejoin by invite');
select is((select my_status from public.group_invite_details(pg_temp.h('e'))), 'removed',
  'and the invite page knows why');

select * from finish();
rollback;
