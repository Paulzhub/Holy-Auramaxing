-- The encouragement wall, reactions, report and block, and the automatic
-- filter (CLAUDE.md §7.7, §7.11, D-077 to D-081). Posts and comments are
-- plain text written only through functions; a block hides both people from
-- each other everywhere; reports reach the group's admins without the
-- reporter's name; encouragement earns XP once per target, at most 10 a day,
-- on that group's Encourager board; the social badges are awarded by the job.
begin;
create extension if not exists pgtap with schema extensions;

select plan(74);

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
create function pg_temp.g() returns uuid language sql as $$ select current_setting('test.g')::uuid $$;
create function pg_temp.add_member(uid uuid, r text default 'member') returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (pg_temp.g(), uid, r, 'active', 'full', now(), now());
$$;
create function pg_temp.set(k text, v text) returns void language sql as $$ select set_config('test.' || k, v, true) $$;
create function pg_temp.get(k text) returns uuid language sql as $$ select current_setting('test.' || k)::uuid $$;
create function pg_temp.jobs() returns void language plpgsql as $$
begin
  perform pg_temp.as_postgres();
  perform private.run_jobs(1000, true);
end;
$$;

\set o '''00000000-0000-7000-8000-000000008001'''
\set a '''00000000-0000-7000-8000-000000008002'''
\set m '''00000000-0000-7000-8000-000000008003'''
\set b '''00000000-0000-7000-8000-000000008004'''
\set r '''00000000-0000-7000-8000-000000008005'''
\set z '''00000000-0000-7000-8000-000000008006'''
select pg_temp.make_user(:o, 'sw-owner@example.test');
select pg_temp.make_user(:a, 'sw-admin@example.test');
select pg_temp.make_user(:m, 'sw-member@example.test');
select pg_temp.make_user(:b, 'sw-blocker@example.test');
select pg_temp.make_user(:r, 'sw-rapid@example.test');
select pg_temp.make_user(:z, 'sw-closing@example.test');

select pg_temp.as_user(:o);
select pg_temp.set('g', public.create_group('Wall group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'A covenant for the wall.', 'checkin_only', true, 'full')::text);
select pg_temp.as_postgres();
select pg_temp.add_member(:a, 'admin');
select pg_temp.add_member(:m);
select pg_temp.add_member(:b);
select pg_temp.add_member(:r);
select pg_temp.add_member(:z);
update private.app_config set value = 5 where key = 'badge_encourager_count';

-- ---------------------------------------------------------------- posts

select pg_temp.as_user(:m);
select pg_temp.set('pm', public.create_post(pg_temp.g(), 'encouragement', E'  Keep going, friends.\r\n\r\n\r\n\r\nWith you.  ')::text);
select is((select body from public.posts where id = pg_temp.get('pm')), E'Keep going, friends.\n\nWith you.',
  'A post is trimmed and runs of blank lines are shortened');
select throws_ok($$ select public.create_post(pg_temp.g(), 'announcement', 'Hear ye') $$,
  '42501', 'group_forbidden', 'A member can''t post an announcement');
select throws_ok($$ select public.create_post(pg_temp.g(), 'gossip', 'Hello') $$,
  '22023', 'invalid_input', 'An unknown kind is refused');
select throws_ok($$ select public.create_post(pg_temp.g(), 'encouragement', E'  \n ') $$,
  '22023', 'invalid_input', 'An empty post is refused');
select throws_ok($$ select public.create_post(pg_temp.g(), 'encouragement', repeat('a', 2001)) $$,
  '22023', 'invalid_input', 'A post over 2,000 characters is refused');
select pg_temp.set('px', public.create_post(pg_temp.g(), 'encouragement', '<script>alert(1)</script><b>hi</b>')::text);
select is((select body from public.posts where id = pg_temp.get('px')), '<script>alert(1)</script><b>hi</b>',
  'Markup is kept as plain text, exactly as typed (the app shows it as text)');
select throws_ok($$ insert into public.posts (group_id, author_id, kind, body)
                    values (pg_temp.g(), auth.uid(), 'encouragement', 'Direct') $$,
  '42501', null, 'Nobody can write posts straight to the table');

select lives_ok($$ select public.edit_post(pg_temp.get('pm'), 'Keep going, friends. With you.') $$,
  'The author edits their post');
select isnt((select edited_at from public.posts where id = pg_temp.get('pm')), null::timestamptz,
  '... and it is marked edited');

select pg_temp.as_user(:a);
select throws_ok($$ select public.edit_post(pg_temp.get('pm'), 'Changed by someone else') $$,
  '42501', 'group_forbidden', 'Nobody else edits it, admins included');
select pg_temp.set('an1', public.create_post(pg_temp.g(), 'announcement', 'Welcome, everyone.')::text);
select public.pin_post(pg_temp.get('an1'), true);
select public.pin_post(public.create_post(pg_temp.g(), 'announcement', 'Second notice.'), true);
select public.pin_post(public.create_post(pg_temp.g(), 'announcement', 'Third notice.'), true);
select throws_ok($$ select public.pin_post(public.create_post(pg_temp.g(), 'announcement', 'Fourth.'), true) $$,
  'P0001', 'pinned_full', 'An admin pins announcements, three at most');
select throws_ok($$ select public.pin_post(pg_temp.get('pm'), true) $$,
  '22023', 'invalid_input', 'Only announcements can be pinned');
select is((select count(*) from public.group_wall(pg_temp.g(), 'pinned')), 3::bigint,
  'The pinned announcements come back together');
select ok(not exists (select 1 from public.group_wall(pg_temp.g()) where pinned),
  '... and stay out of the ordinary pages');

-- ---------------------------------------------------------------- the filter

select pg_temp.as_user(:m);
select throws_ok($$ select public.create_post(pg_temp.g(), 'encouragement', 'You are a retard') $$,
  '22023', 'content_blocked', 'A slur is refused');
select throws_ok($$ select public.create_comment(pg_temp.get('pm'), 'f a g g o t') $$,
  '22023', 'content_blocked', '... also spelled out letter by letter, in a comment');
select throws_ok($$ select public.create_post(pg_temp.g(), 'encouragement', 'what a R3TAAARD') $$,
  '22023', 'content_blocked', '... and with look-alike characters and repeats');
select is(util.filter_match('Praying for our friends in Niger and Nigeria this week'), null,
  'A place name that looks like a slur is fine');
select is(util.filter_match('I snigger at my old excuses'), null, 'So is an ordinary word that contains one');
select is(util.filter_match('Porn had a hold on me for years; this group helps.'), null,
  'Talking about the struggle itself is allowed');
select is(util.filter_match('Help that worked for me: https://www.covenanteyes.com/porn-addiction-help/'), null,
  'A link to help is allowed, even with the word in it');
select is(util.filter_match('see www.pornhub.com'), 'link', 'A link to an explicit site is refused');
select is(util.filter_match('es.xvideos.com/video123'), 'link', '... and its subdomains');
select is(util.filter_match('https://example.xxx/a'), 'link', '... and explicit top-level domains');
select is(util.filter_match('https://example.com/nsfw/clip'), 'link', '... and links marked as explicit');
select is(util.filter_match('ｒｅｔａｒｄ'), 'slur', 'Full-width letters are folded first');

-- ---------------------------------------------------------------- comments and reactions

select pg_temp.as_user(:o);
select pg_temp.set('po', public.create_post(pg_temp.g(), 'encouragement', 'Owner''s word for today.')::text);
select pg_temp.as_user(:m);
select pg_temp.set('cm', public.create_comment(pg_temp.get('po'), 'Amen to that.')::text);
select public.set_reaction('post', pg_temp.get('po'), 'heart', true);
select public.set_reaction('post', pg_temp.get('po'), 'heart', true);
select public.set_reaction('post', pg_temp.get('po'), 'heart', false);
select public.set_reaction('post', pg_temp.get('po'), 'heart', true);
select public.set_reaction('post', pg_temp.get('pm'), 'fire', true);
select is((select count(*) from public.reactions where user_id = :m and target_id = pg_temp.get('po')), 1::bigint,
  'A reaction is kept once, however often it''s pressed');
select throws_ok($$ select public.set_reaction('post', pg_temp.get('po'), 'thumbs', true) $$,
  '22023', 'invalid_input', 'Only the five reactions exist');
select pg_temp.jobs();
select is((select coalesce(sum(points), 0) from public.xp_ledger where user_id = :m and reason = 'encouragement'),
  2::bigint, 'A comment and a reaction on someone else''s post earn +1 each; taking it back and again pays nothing more');
select is((select count(*) from public.xp_ledger where user_id = :m and reason = 'encouragement'
             and group_id = pg_temp.g()), 2::bigint, '... in that group, for its Encourager board');

-- The daily cap: twelve more reactions on prayer requests still make 10 in all.
select pg_temp.as_user(:o);
select pg_temp.set('pr' || n, public.create_post(pg_temp.g(), 'prayer_request', 'Please pray, day ' || n)::text)
  from generate_series(1, 12) n;
select pg_temp.as_user(:m);
select public.set_reaction('post', pg_temp.get('pr' || n), 'pray', true) from generate_series(1, 12) n;
select pg_temp.jobs();
select is((select sum(points) from public.xp_ledger where user_id = :m and reason = 'encouragement'),
  10::bigint, 'Encouragement XP stops at 10 a day');
select pg_temp.as_user(:m);
select is((select score from public.group_leaderboard(pg_temp.g(), 'encourager') where member_id = :m), 10,
  'The Encourager board shows it');
select is((select reactions ->> 'pray' from public.group_wall(pg_temp.g(), 'prayer_request') where id = pg_temp.get('pr1')),
  '1', 'The wall counts "I prayed"');
select is((select my_reactions from public.group_wall(pg_temp.g(), 'prayer_request') where id = pg_temp.get('pr1')),
  array['pray'], '... and knows I prayed');
select ok((select bool_and(b) from (values
    (exists (select 1 from public.user_badges where user_id = :m and badge = 'prayer_warrior')),
    (exists (select 1 from public.user_badges where user_id = :m and badge = 'encourager'))) v(b)),
  'Prayer Warrior and Encourager are awarded by the job');
select pg_temp.as_user(:o);
select public.set_reaction('post', pg_temp.get('po'), 'dove', true);
select pg_temp.jobs();
select is((select count(*) from public.xp_ledger where user_id = :o and reason = 'encouragement'), 0::bigint,
  'Reacting to your own post earns nothing');
select pg_temp.as_user(:o);
select public.create_post(pg_temp.g(), 'testimony', 'Six months ago I could not have written this.');
select pg_temp.jobs();
select ok(exists (select 1 from public.user_badges where user_id = :o and badge = 'first_testimony'),
  'A first testimony earns First Testimony');

-- ---------------------------------------------------------------- block

select pg_temp.as_user(:b);
select pg_temp.set('pb', public.create_post(pg_temp.g(), 'encouragement', 'From the blocker.')::text);
select pg_temp.set('cb', public.create_comment(pg_temp.get('po'), 'A comment from the blocker.')::text);
select public.set_reaction('post', pg_temp.get('po'), 'strong', true);
select public.block_member(:m);
select pg_temp.as_postgres();
select private.refresh_leaderboard(pg_temp.g());
select pg_temp.as_user(:b);
select throws_ok($$ select public.block_member(auth.uid()) $$, '22023', 'invalid_input', 'Nobody blocks themselves');

select pg_temp.as_user(:m);
select ok(not exists (select 1 from public.group_wall(pg_temp.g()) where author_id = :b),
  'The blocked person no longer sees the blocker''s posts');
select ok(not exists (select 1 from public.post_comments(pg_temp.get('po')) where author_id = :b),
  '... or comments');
select is((select reactions ->> 'strong' from public.group_wall(pg_temp.g()) where id = pg_temp.get('po')), null,
  '... or reactions, even in the counts');
select is((select comment_count from public.group_wall(pg_temp.g()) where id = pg_temp.get('po')), 1::bigint,
  '... and the comment count leaves theirs out');
select is((select count(*) from public.profile_cards where id = :b), 0::bigint, '... or profile card');
select is((select count(*) from public.group_checkins_today where user_id = :b), 0::bigint, '... or Today row');
select is((select count(*) from public.group_members where user_id = :b), 0::bigint, '... or membership');
select is((select count(*) from public.posts where author_id = :b), 0::bigint, '... even reading the table directly');
select ok(exists (select 1 from public.group_leaderboard(pg_temp.g(), 'xp') where is_hidden and member_id is null)
          and not exists (select 1 from public.group_leaderboard(pg_temp.g(), 'xp') where member_id = :b),
  'On the board the blocker keeps a place, with no name');
select throws_ok(format($$ select public.create_comment(%L, 'Hello?') $$, pg_temp.get('pb')),
  '42501', 'post_not_found', 'The blocked person can''t comment on the blocker''s post');
select throws_ok(format($$ select public.set_reaction('comment', %L, 'heart', true) $$, pg_temp.get('cb')),
  '42501', 'comment_not_found', '... or react to their comment');
select throws_ok(format($$ select public.report_content(pg_temp.g(), 'post', %L, 'spam') $$, pg_temp.get('pb')),
  '42501', 'post_not_found', '... or even find it to report');

select pg_temp.as_user(:b);
select ok(not exists (select 1 from public.group_wall(pg_temp.g()) where author_id = :m)
          and not exists (select 1 from public.profile_cards where id = :m),
  'It works both ways: the blocker no longer sees the blocked person either');
select is((select count(*) from public.my_blocked_people()), 1::bigint, 'The blocker sees whom they blocked');
select pg_temp.as_user(:m);
select is((select count(*) from public.blocks), 0::bigint, 'The blocked person can''t see that they were blocked');
select pg_temp.as_user(:a);
select is((select count(*) from public.group_members where user_id in (:b, :m)), 2::bigint,
  'An admin still sees both memberships, to look after the group');
select pg_temp.as_user(:b);
select public.unblock_member(:m);
select pg_temp.as_user(:m);
select ok(exists (select 1 from public.group_wall(pg_temp.g()) where author_id = :b),
  'Unblocking shows them again');

-- ---------------------------------------------------------------- delete and moderate

select pg_temp.as_user(:m);
select throws_ok(format($$ select public.delete_post(%L) $$, pg_temp.get('po')),
  '42501', 'group_forbidden', 'A member can''t delete someone else''s post');
select public.delete_post(pg_temp.get('px'));
select pg_temp.as_postgres();
select ok((select deleted_at is not null and body is null and not removed_by_admin from public.posts
            where id = pg_temp.get('px')), 'Deleting your own post clears its text at once');

select pg_temp.as_user(:m);
select pg_temp.set('rep', public.report_content(pg_temp.g(), 'post', pg_temp.get('po'), 'unkind', 'Felt harsh.')::text);
select is(public.report_content(pg_temp.g(), 'post', pg_temp.get('po'), 'spam'), pg_temp.get('rep'),
  'Reporting the same thing twice keeps one open report');
select throws_ok($$ select public.report_content(pg_temp.g(), 'member', auth.uid(), 'spam') $$,
  '42501', 'member_not_found', 'Nobody reports themselves');
select pg_temp.as_user(:a);
select is((select snapshot from public.group_reports(pg_temp.g()) where id = pg_temp.get('rep')),
  'Owner''s word for today.', 'An admin sees the report with the text as it was');
select throws_ok($$ select reporter_id from public.reports $$, '42501', null,
  '... but never who reported it');
select pg_temp.as_user(:o);
select is((select count(*) from public.group_reports(pg_temp.g())), 0::bigint,
  'The person reported doesn''t see reports about themselves, even as owner');
select throws_ok(format($$ select public.resolve_report(%L, 'dismissed') $$, pg_temp.get('rep')),
  '42501', 'report_not_found', '... and can''t close them');
select pg_temp.as_user(:a);
select public.delete_post(pg_temp.get('po'));
select public.resolve_report(pg_temp.get('rep'), 'actioned');
select pg_temp.as_postgres();
select ok((select status = 'actioned' and snapshot is null from public.reports where id = pg_temp.get('rep')),
  'An admin removes the post and closes the report; the copy is cleared');
select is((select count(*) from public.audit_log
            where (action = 'post.removed' and metadata ->> 'group' = pg_temp.g()::text)
               or (action = 'report.resolved' and target_id = pg_temp.g())),
  2::bigint, 'Both are audited');

-- ---------------------------------------------------------------- limits, closing and erasure

select pg_temp.as_user(:r);
create function pg_temp.many_posts(n integer) returns integer language plpgsql as $$
declare i integer; ok integer := 0;
begin
  for i in 1..n loop
    begin
      perform public.create_post(pg_temp.g(), 'encouragement', 'Rapid ' || i);
      ok := ok + 1;
    exception when sqlstate 'PT429' then
      null;
    end;
  end loop;
  return ok;
end;
$$;
select is(pg_temp.many_posts(30), 25, 'Twenty-five posts an hour go through, the rest are refused (PT429)');

select pg_temp.as_user(:z);
select pg_temp.set('pz', public.create_post(pg_temp.g(), 'encouragement', 'From someone about to close.')::text);
select pg_temp.as_postgres();
update public.profiles set deletion_requested_at = now() where id = :z;
select pg_temp.as_user(:m);
select ok(not exists (select 1 from public.group_wall(pg_temp.g()) where id = pg_temp.get('pz')),
  'Posts by an account that is closing are hidden');
select pg_temp.as_user(:z);
select throws_ok($$ select public.create_post(pg_temp.g(), 'encouragement', 'Still here?') $$,
  '42501', 'account_closing', '... and it can''t post while closing');

select pg_temp.as_postgres();
update public.groups set archived_at = now() where id = pg_temp.g();
select pg_temp.as_user(:m);
select throws_ok($$ select public.create_post(pg_temp.g(), 'encouragement', 'Anyone?') $$,
  'P0001', 'group_archived', 'An archived group''s wall can be read but not written');
select pg_temp.as_postgres();
update public.groups set archived_at = null where id = pg_temp.g();

select pg_temp.as_user(:b);
select public.block_member(:m);
select pg_temp.as_postgres();
select private.erase_account(:m);
select is((select author_id from public.posts where id = pg_temp.get('pm')), null::uuid,
  'Erasing an account keeps its posts, as a former member''s');
select is((select count(*) from public.comments where id = pg_temp.get('cm') and author_id is null), 1::bigint,
  '... and its comments');
select is((select count(*) from public.reactions where user_id = :m), 0::bigint, '... removes its reactions');
select is((select count(*) from public.blocks where :m in (blocker_id, blocked_id)), 0::bigint, '... and blocks');
select is((select count(*) from public.reports where reporter_id = :m), 0::bigint, '... and the reports it made');

select * from finish();
rollback;
