-- Security review 2 (D-093, D-095). A block hides two people from each
-- other, but it must never take moderation away from a group's owners and
-- admins: a member who posts something cruel and then blocks every admin
-- must still have it removed (SR2-1). And comments must follow their post:
-- once a post is deleted, or hidden from me (its author blocked me, or a
-- milestone card is no longer shown), its comments can't be read straight
-- from the table either (SR2-3).
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

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
create function pg_temp.add_member(g uuid, uid uuid, r text default 'member') returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (g, uid, r, 'active', 'full', now(), now());
$$;

\set o '''00000000-0000-7000-8000-000000008301'''
\set a '''00000000-0000-7000-8000-000000008302'''
\set x '''00000000-0000-7000-8000-000000008303'''
\set m '''00000000-0000-7000-8000-000000008304'''
\set n '''00000000-0000-7000-8000-000000008305'''
\set q '''00000000-0000-7000-8000-000000008306'''
select pg_temp.make_user(:o, 'mod-owner@example.test');
select pg_temp.make_user(:a, 'mod-admin@example.test');
select pg_temp.make_user(:x, 'mod-unkind@example.test');
select pg_temp.make_user(:m, 'mod-member@example.test');
select pg_temp.make_user(:n, 'mod-member2@example.test');
select pg_temp.make_user(:q, 'mod-other-owner@example.test');

select pg_temp.as_user(:o);
select pg_temp.set('g', public.create_group('Moderated group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'A covenant for moderation.', 'checkin_only', true, 'full')::text);
select pg_temp.as_user(:q);
select pg_temp.set('h', public.create_group('Another group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'Another covenant.', 'checkin_only', true, 'full')::text);
select pg_temp.as_postgres();
select pg_temp.add_member(pg_temp.get('g'), :a, 'admin');
select pg_temp.add_member(pg_temp.get('g'), :x);
select pg_temp.add_member(pg_temp.get('g'), :m);
select pg_temp.add_member(pg_temp.get('g'), :n);
select pg_temp.add_member(pg_temp.get('h'), :x);

-- ---------------------------------------------------------------- SR2-1: blocking the admins

-- x posts something unkind, comments under m's post, then blocks the owner,
-- the admin and m.
select pg_temp.as_user(:m);
select pg_temp.set('pm', public.create_post(pg_temp.get('g'), 'encouragement', 'Keep going, everyone.')::text);
select pg_temp.as_user(:x);
select pg_temp.set('px', public.create_post(pg_temp.get('g'), 'encouragement', 'Something cruel about someone')::text);
select pg_temp.set('px2', public.create_post(pg_temp.get('g'), 'encouragement', 'More of the same')::text);
select pg_temp.set('cx', public.create_comment(pg_temp.get('pm'), 'A cruel reply')::text);
select public.block_member(:o);
select public.block_member(:a);
select public.block_member(:m);

-- Another member (not blocked) still sees it, and reports it.
select pg_temp.as_user(:n);
select is((select count(*) from public.group_wall(pg_temp.get('g')) w where w.id = pg_temp.get('px')), 1::bigint,
  'Members the author didn''t block still see the post');
select public.report_content(pg_temp.get('g'), 'post', pg_temp.get('px'), 'unkind');

select pg_temp.as_user(:o);
select is((select count(*) from public.group_wall(pg_temp.get('g')) w where w.id = pg_temp.get('px')), 0::bigint,
  'The block still hides the post from the owner''s own wall');
select lives_ok($$ select public.delete_post(pg_temp.get('px')) $$,
  'SR2-1: the owner removes a post whose author blocked them');
select pg_temp.as_postgres();
select ok((select deleted_at is not null and removed_by_admin and body is null from public.posts where id = pg_temp.get('px')),
  '... it is gone, marked as removed by an admin, its text cleared');
select is((select count(*) from public.audit_log where action = 'post.removed' and actor_id = :o::uuid and target_id = :x::uuid), 1::bigint,
  '... and the removal is audited');

select pg_temp.as_user(:a);
select lives_ok($$ select public.delete_post(pg_temp.get('px2')) $$,
  'SR2-1: an admin the author blocked removes their post too');
select lives_ok($$ select public.delete_comment(pg_temp.get('cx')) $$,
  'SR2-1: ... and their comment');
select pg_temp.as_postgres();
select ok((select deleted_at is not null and removed_by_admin from public.comments where id = pg_temp.get('cx')),
  '... the comment is gone, marked as removed by an admin');

-- A block is still no way in for anyone who isn't a moderator of that group.
select pg_temp.as_user(:x);
select pg_temp.set('px3', public.create_post(pg_temp.get('g'), 'encouragement', 'Still here')::text);
select pg_temp.set('pxh', public.create_post(pg_temp.get('h'), 'encouragement', 'In the other group')::text);
select pg_temp.as_user(:m);
select throws_ok($$ select public.delete_post(pg_temp.get('px3')) $$,
  '42501', 'post_not_found', 'A member the author blocked still can''t touch the post');
select pg_temp.as_user(:o);
select throws_ok($$ select public.delete_post(pg_temp.get('pxh')) $$,
  '42501', 'post_not_found', 'An owner can''t remove a post in a group they aren''t in (same answer as no post)');
select pg_temp.as_user(:q);
select throws_ok($$ select public.delete_post(pg_temp.get('px3')) $$,
  '42501', 'post_not_found', 'Another group''s owner can''t remove it either');
select pg_temp.as_postgres();
select is((select count(*) from public.posts where id = pg_temp.get('px3') and deleted_at is null), 1::bigint,
  '... so it is still there');

-- ---------------------------------------------------------------- SR2-3: comments follow their post

-- A prayer request, a reply that quotes it, then the author deletes it.
select pg_temp.as_user(:n);
select pg_temp.set('pp', public.create_post(pg_temp.get('g'), 'prayer_request', 'Something private I shared')::text);
select pg_temp.as_user(:o);
select public.create_comment(pg_temp.get('pp'), 'Praying about the private thing you shared');
select pg_temp.as_user(:n);
select public.delete_post(pg_temp.get('pp'));
select pg_temp.as_user(:o);
select is((select count(*) from public.comments where post_id = pg_temp.get('pp')), 0::bigint,
  'SR2-3: once a post is deleted, its comments can''t be read from the table');

-- A post by someone who blocked me: its comments by others are hidden too.
select pg_temp.as_user(:n);
select public.create_comment(pg_temp.get('px3'), 'A kind reply under it');
select pg_temp.as_user(:m);
select is((select count(*) from public.comments where post_id = pg_temp.get('px3')), 0::bigint,
  'SR2-3: comments under a post hidden from me (its author blocked me) can''t be read');
select pg_temp.as_user(:n);
select is((select count(*) from public.comments where post_id = pg_temp.get('px3')), 1::bigint,
  '... while members who can see the post still read them');

-- A milestone card whose member stopped sharing their streak: hidden, with its comments.
select pg_temp.as_postgres();
insert into public.user_badges (user_id, badge) values (:m, 'free_7');
select pg_temp.set('pc', (select id::text from public.posts where author_id = :m::uuid and kind = 'milestone'));
select pg_temp.as_user(:n);
select public.create_comment(pg_temp.get('pc'), 'Well done!');
select pg_temp.as_postgres();
update public.group_members set share_level = 'checkin_only' where group_id = pg_temp.get('g') and user_id = :m::uuid;
select pg_temp.as_user(:n);
select is((select count(*) from public.comments where post_id = pg_temp.get('pc')), 0::bigint,
  'SR2-3: comments under a milestone card that is no longer shown can''t be read');

select * from finish();
rollback;
