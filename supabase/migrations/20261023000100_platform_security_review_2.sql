-- Security review 2 (after Phase 7). See docs/security-review-2.md and
-- D-093 to D-097. Each part has a failing test written before it:
-- supabase/tests/database/083_social_moderation_blocks.test.sql and
-- 093_notifications_hardening.test.sql.

-- ---------------------------------------------------------------- SR2-1: a block never stops moderation (D-093)

-- A block hides two people from each other (D-078), but a member who posts
-- something cruel and then blocks every owner and admin must not make it
-- permanent. The group's owners and admins can always reach a post or
-- comment in their own group to remove it, block or not. Everyone else gets
-- the same answer as before (post_not_found), so this opens nothing new to
-- members or to other groups. Reading is unchanged: the block still hides
-- the post from the admin's own wall; they reach it from the report.

create or replace function private.moderatable_post(p_post uuid, p_caller uuid)
returns public.posts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.posts;
begin
  select * into p from public.posts where id = p_post;
  if p.id is not null and p.deleted_at is null and exists (
    select 1 from public.group_members m
     where m.group_id = p.group_id and m.user_id = p_caller and m.status = 'active'
       and m.role in ('owner', 'admin')
  ) then
    return p;
  end if;
  return private.visible_post(p_post, p_caller);
end;
$$;

create or replace function private.moderatable_comment(p_comment uuid, p_caller uuid)
returns public.comments
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.comments;
begin
  select * into c from public.comments where id = p_comment;
  if c.id is not null and c.deleted_at is null
     and exists (select 1 from public.posts p where p.id = c.post_id and p.deleted_at is null)
     and exists (
       select 1 from public.group_members m
        where m.group_id = c.group_id and m.user_id = p_caller and m.status = 'active'
          and m.role in ('owner', 'admin')
     ) then
    return c;
  end if;
  return private.visible_comment(p_comment, p_caller);
end;
$$;

revoke all on function private.moderatable_post(uuid, uuid) from public;
revoke all on function private.moderatable_comment(uuid, uuid) from public;

-- As in 6a, but reaching the post through moderatable_post.
create or replace function public.delete_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.posts;
  c record;
  v_by_admin boolean;
begin
  p := private.moderatable_post(p_post, v_uid);
  select * into c from private.social_member(p.group_id, false);
  v_by_admin := p.author_id is distinct from v_uid;
  if v_by_admin and c.my_role not in ('owner', 'admin') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'post_write', 25, interval '1 hour');
  update public.posts
     set deleted_at = now(), body = null, pinned = false, removed_by_admin = v_by_admin
   where id = p.id;
  delete from public.reactions where target_type = 'post' and target_id = p.id;
  if v_by_admin then
    perform private.group_audit(v_uid, 'post.removed', p.group_id, p.author_id,
                                jsonb_build_object('post', p.id, 'kind', p.kind));
  end if;
end;
$$;

create or replace function public.delete_comment(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  c public.comments;
  m record;
  v_by_admin boolean;
begin
  c := private.moderatable_comment(p_comment, v_uid);
  select * into m from private.social_member(c.group_id, false);
  v_by_admin := c.author_id is distinct from v_uid;
  if v_by_admin and m.my_role not in ('owner', 'admin') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'comment_write', 75, interval '1 hour');
  update public.comments set deleted_at = now(), body = null, removed_by_admin = v_by_admin where id = c.id;
  delete from public.reactions where target_type = 'comment' and target_id = c.id;
  if v_by_admin then
    perform private.group_audit(v_uid, 'comment.removed', c.group_id, c.author_id,
                                jsonb_build_object('comment', c.id, 'post', c.post_id));
  end if;
end;
$$;

-- ---------------------------------------------------------------- SR2-2: push services only (D-094)

-- A subscription's endpoint is where the sender POSTs. Any https address
-- used to be accepted, so a signed-in person could point "their device" at
-- a home router, a cloud metadata service or another site and have the
-- server call it on every notification (and learn from the device list
-- whether it answered 404/410). Only the push services browsers use are
-- allowed now, on the default port, with no user name:
--   fcm.googleapis.com                Chrome, Edge on Android, Samsung, Opera, Brave
--   updates.push.services.mozilla.com Firefox
--   web.push.apple.com                Safari (macOS, and iOS 16.4+ Home Screen apps)
--   <name>.notify.windows.com         Edge on Windows (WNS)
-- The same list is in src/lib/push/endpoints.ts. A browser with another
-- push service would need adding here and there.
create or replace function util.push_endpoint_ok(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_endpoint is not null and char_length(p_endpoint) <= 1000
     and p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]]*$';
$$;

revoke all on function util.push_endpoint_ok(text) from public, anon;
grant execute on function util.push_endpoint_ok(text) to authenticated, service_role;

delete from public.push_subscriptions where not util.push_endpoint_ok(endpoint);
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_service check (util.push_endpoint_ok(endpoint));

-- As in 7c, with the allow-list in place of "any https address".
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if not util.push_endpoint_ok(p_endpoint)
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{20,200}={0,2}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{8,100}={0,2}$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'push_subscription', 30, interval '1 hour');
  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, nullif(left(coalesce(p_label, ''), 60), ''))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, created_at = case when s.user_id = excluded.user_id then s.created_at else now() end;
  delete from public.push_subscriptions
   where id in (select ps.id from public.push_subscriptions ps where ps.user_id = v_uid
                 order by ps.created_at desc offset 10);
end;
$$;

-- ---------------------------------------------------------------- SR2-3: comments follow their post (D-095)

-- A comment is readable only while its post is readable to me (the posts
-- policy applies inside this one): not after the post is deleted, not when
-- its author and I are blocked either way, not under a milestone card that
-- is no longer shown. The functions (post_comments) already worked this way.
drop policy "comments: members read" on public.comments;
create policy "comments: members read" on public.comments
  for select to authenticated
  using (
    util.group_status(group_id) = 'active' and deleted_at is null
    and (author_id is null or (util.account_open(author_id)
                               and not util.blocked_between((select auth.uid()), author_id)))
    and exists (select 1 from public.posts p where p.id = comments.post_id)
  );

-- ---------------------------------------------------------------- SR2-4: listen-only live channels (D-096)

-- Pings used to go out on public Realtime channels, where any browser
-- holding the publishable key can also *send*. Someone who once had a
-- channel's name (a member removed today, or anyone shown it) could fake
-- pings to every member's open page, each making it ask the server again.
-- Now the pings are private messages, and browsers (anon, with the
-- publishable key; or a signed-in token) may only listen, and only on our
-- channel names. No insert policy exists, so client broadcasts are refused.
create or replace function private.ping_group(p_group uuid, p_what text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_group is null then
    return;
  end if;
  perform realtime.send(jsonb_build_object('what', p_what), 'changed',
                        private.group_topic(p_group, (now() at time zone 'utc')::date), true);
end;
$$;

create or replace function private.ping_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('what', 'alerts'), 'changed',
                        private.user_topic(p_user, (now() at time zone 'utc')::date), true);
end;
$$;

create policy "live pings: listen only" on realtime.messages
  for select to anon, authenticated
  using (
    extension = 'broadcast'
    and topic = (select realtime.topic())
    and (select realtime.topic()) ~ '^(group|user):[0-9a-f]{40}$'
  );

-- ---------------------------------------------------------------- SR2-5: muting stops queued nudges (D-097)

-- run_notify_job checked util.takes_nudges(group, user), the wrong way round,
-- so the check always passed and a nudge still queued when its recipient
-- muted nudges was delivered anyway. Unchanged otherwise.
create or replace function private.run_notify_job(p_msg jsonb, p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text := p_msg ->> 'event';
  v_group uuid := (p_msg ->> 'group')::uuid;
  v_actor uuid := (p_msg ->> 'actor')::uuid;
  v_user uuid := (p_msg ->> 'user')::uuid;
  v_after uuid := (p_msg ->> 'after')::uuid;
  v_page integer := util.config_int('notify_fanout_page');
  v_users uuid[];
  v_type text;
  v_owner uuid;
  v_kind text;
  r record;
begin
  case v_event
    -- Someone nudged me (pray_for_me included). Muted since? Then nothing.
    when 'nudge' then
      select n.* into r from public.nudges n where n.id = (p_msg ->> 'nudge')::uuid;
      if r.id is null or not util.takes_nudges(r.to_user, r.group_id) then
        return;
      end if;
      perform private.deliver(array[r.to_user], 'nudge', r.group_id, r.from_user,
                              jsonb_build_object('kind', r.kind), 'nudge:' || r.id, null, p_now);

    -- A reaction on my post, comment or check-in; "I prayed" on my prayer
    -- request is its own type. One unread row per thing ("3 people").
    when 'reaction' then
      select x.* into r from public.reactions x where x.id = (p_msg ->> 'reaction')::uuid;
      if r.id is null then
        return;
      end if;
      v_type := 'reaction';
      if r.target_type = 'post' then
        select p.author_id, p.kind into v_owner, v_kind from public.posts p
         where p.id = r.target_id and p.deleted_at is null;
        if v_kind = 'prayer_request' and r.kind = 'pray' then
          v_type := 'prayed_for_you';
        elsif v_kind = 'milestone' then
          -- A milestone card belongs to its member.
          null;
        end if;
      elsif r.target_type = 'comment' then
        select c.author_id into v_owner from public.comments c where c.id = r.target_id and c.deleted_at is null;
      else
        select c.user_id into v_owner from public.checkins c where c.id = r.target_id;
      end if;
      perform private.deliver(array[v_owner], v_type, r.group_id, r.user_id,
                              jsonb_build_object('target', r.target_type, 'id', r.target_id, 'kind', r.kind,
                                                 'post', case when r.target_type = 'comment'
                                                   then (select c.post_id from public.comments c where c.id = r.target_id)
                                                   when r.target_type = 'post' then r.target_id end),
                              'reaction:' || r.user_id || ':' || r.target_id || ':' || r.kind,
                              v_type || ':' || r.target_id, p_now);

    -- A comment: the post's author, and the people who commented before
    -- (a reply in the same conversation), at most a handful.
    when 'comment' then
      select c.*, p.author_id as post_author into r
        from public.comments c join public.posts p on p.id = c.post_id
       where c.id = (p_msg ->> 'comment')::uuid and c.deleted_at is null and p.deleted_at is null;
      if r.id is null then
        return;
      end if;
      perform private.deliver(array[r.post_author], 'comment', r.group_id, r.author_id,
                              jsonb_build_object('post', r.post_id, 'reply', false),
                              'comment:' || r.id, 'comment:' || r.post_id, p_now);
      select coalesce(array_agg(f.author_id), '{}') into v_users from (
        select c2.author_id from public.comments c2
         where c2.post_id = r.post_id and c2.id < r.id and c2.deleted_at is null
           and c2.author_id is not null and c2.author_id is distinct from r.post_author
         group by c2.author_id order by max(c2.created_at) desc
         limit util.config_int('notify_comment_followers')) f;
      perform private.deliver(v_users, 'comment', r.group_id, r.author_id,
                              jsonb_build_object('post', r.post_id, 'reply', true),
                              'comment:' || r.id, 'comment:' || r.post_id, p_now);

    -- A post the whole group hears about: a prayer request, an announcement,
    -- a milestone card (only while its member still shares their streak or
    -- more, D-085). Paged: 500 people a job.
    when 'post' then
      select p.* into r from public.posts p where p.id = (p_msg ->> 'post')::uuid and p.deleted_at is null;
      if r.id is null or r.kind not in ('prayer_request', 'announcement', 'milestone') then
        return;
      end if;
      if r.kind = 'milestone' and not util.milestone_visible(r.group_id, r.author_id) then
        return;
      end if;
      v_users := private.group_audience(r.group_id, v_after, v_page, false);
      perform private.deliver(v_users, r.kind, r.group_id, r.author_id,
                              jsonb_build_object('post', r.id, 'badge', r.badge),
                              'post:' || r.id, null, p_now);
      if cardinality(v_users) = v_page then
        perform private.notify('post', jsonb_build_object('post', r.id, 'after', v_users[v_page]));
      end if;

    -- Someone joined (owners and admins hear), or asked to join (the same).
    when 'member' then
      select m.* into r from public.group_members m where m.group_id = v_group and m.user_id = v_user;
      if r.user_id is null or r.status not in ('active', 'pending') then
        return;
      end if;
      v_users := private.group_audience(v_group, null, 200, true);
      if r.status = 'active' then
        perform private.deliver(v_users, 'member_joined', v_group, v_user, '{}'::jsonb,
                                'joined:' || v_group || ':' || v_user || ':' || r.joined_at::date, null, p_now);
      else
        perform private.deliver(v_users, 'join_request', v_group, v_user, '{}'::jsonb,
                                'join_request:' || v_group || ':' || v_user || ':' || r.requested_at::date,
                                'join_request:' || v_group, p_now);
      end if;

    -- A report: the group's owners and admins, except whoever it's about,
    -- never naming who made it (D-079). One unread row per group.
    when 'report' then
      select x.* into r from public.reports x where x.id = (p_msg ->> 'report')::uuid and x.status = 'open';
      if r.id is null then
        return;
      end if;
      v_users := array(select u from unnest(private.group_audience(r.group_id, null, 200, true)) u
                        where u is distinct from r.subject_id and u is distinct from r.reporter_id);
      perform private.deliver(v_users, 'report', r.group_id, null, '{}'::jsonb,
                              'report:' || r.id, 'report:' || r.group_id, p_now);

    -- A partner request, accepted, or ended by the other person.
    when 'partnership' then
      select x.* into r from public.partnerships x where x.id = (p_msg ->> 'partnership')::uuid;
      if r.id is null then
        return;
      end if;
      v_kind := p_msg ->> 'what';
      perform private.deliver(
        array[case when v_actor = r.user_a then r.user_b else r.user_a end],
        'partner_request', r.group_id, v_actor, jsonb_build_object('what', v_kind, 'partnership', r.id),
        'partnership:' || r.id || ':' || v_kind, null, p_now);

    when 'badge' then
      perform private.deliver(array[v_user], 'badge_earned', null, null,
                              jsonb_build_object('badge', p_msg ->> 'badge'), 'badge:' || (p_msg ->> 'badge'),
                              null, p_now);

    when 'level' then
      perform private.deliver(array[v_user], 'level_up', null, null,
                              jsonb_build_object('level', (p_msg ->> 'level')::integer),
                              'level:' || (p_msg ->> 'level') || ':' || (p_msg ->> 'day'), 'level_up', p_now);

    -- A challenge starts or finishes: everyone in the group. Paged.
    when 'challenge' then
      v_users := private.group_audience(v_group, v_after, v_page, false);
      perform private.deliver(v_users, 'challenge', v_group, null,
                              jsonb_build_object('phase', p_msg ->> 'phase'),
                              'challenge:' || v_group || ':' || (p_msg ->> 'phase') || ':' || (p_msg ->> 'day'),
                              null, p_now);
      if cardinality(v_users) = v_page then
        perform private.notify('challenge', (p_msg - 'after') || jsonb_build_object('after', v_users[v_page]));
      end if;

    -- A tighter covenant waits for every member's answer (D-039). Paged.
    when 'covenant' then
      select x.* into r from public.group_covenant_proposals x
       where x.id = (p_msg ->> 'proposal')::uuid and x.closed_at is null;
      if r.id is null then
        return;
      end if;
      v_users := private.group_audience(r.group_id, v_after, v_page, false);
      perform private.deliver(v_users, 'covenant', r.group_id, r.proposed_by,
                              jsonb_build_object('proposal', r.id), 'covenant:' || r.id, null, p_now);
      if cardinality(v_users) = v_page then
        perform private.notify('covenant', jsonb_build_object('proposal', r.id, 'after', v_users[v_page]));
      end if;

    -- A new sign-in on a new device, or a changed password. Can't be turned
    -- off; never names the device or place.
    when 'security' then
      perform private.deliver(array[v_user], 'security', null, null,
                              jsonb_build_object('what', p_msg ->> 'what'), null, null, p_now);

    -- A partner pressed SOS: each active partner whose subject allowed alerts
    -- (D-083). In every group where they're partners, or just one.
    when 'partner_sos' then
      for r in
        select x.group_id, case when x.user_a = v_user then x.user_b else x.user_a end as partner
          from public.partnerships x
         where x.status = 'active' and v_user in (x.user_a, x.user_b)
           and (v_group is null or x.group_id = v_group)
           and case when x.user_a = v_user then x.a_allows_alerts else x.b_allows_alerts end
      loop
        perform private.deliver(array[r.partner], 'partner_sos', r.group_id, v_user, '{}'::jsonb,
                                null, null, p_now);
      end loop;

    -- The scheduler's own: one type, one person (reminders, recap, partner alerts).
    when 'direct' then
      perform private.deliver(array[v_user], p_msg ->> 'type', v_group, v_actor,
                              coalesce(p_msg -> 'data', '{}'::jsonb), p_msg ->> 'dedupe', null, p_now);
    else
      raise exception 'notify_unknown_event';
  end case;
end;
$$;

revoke all on function private.run_notify_job(jsonb, timestamptz) from public;
