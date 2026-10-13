-- notifications: the catalogue, notifications, preferences, the fan-out
-- queue and the in-app functions (CLAUDE.md §7.8). Phase 7b; see D-089 to
-- D-091.
--
-- The pipeline:
--
--   event (a trigger, or the scheduler in the next migration)
--     -> private.notify(type, payload): one small job on the pgmq 'notify'
--        queue (ids only). The write that caused it returns at once.
--     -> private.run_notify(), pg_cron every 5 seconds: each job works out
--        its recipients, at most 500 at a time (a bigger group queues the
--        rest as a follow-on job), leaving out the actor, blocked pairs,
--        closing accounts and anyone the event no longer concerns, and
--        inserts their notifications rows (deduplicated, or folded into an
--        unread one: "3 people reacted").
--     -> for each new row, one private.notification_deliveries row per
--        channel that is switched on for that type (push, email), planned
--        now: ready, held (snooze, quiet hours), digest, or skipped (rate
--        limited). Partner SOS and security alerts skip snooze, quiet hours,
--        digest and group mutes.
--     -> a content-free ping on the person's own daily HMAC channel, so an
--        open app updates the bell (D-086's pattern, per person).
--     -> Phase 7c's sender claims 'ready' deliveries, sends them, and
--        records the result.
--
-- In-app is always on. Every row holds ids only; the words come from the
-- app's message files at render time.

-- ---------------------------------------------------------------- the catalogue

create table public.notification_types (
  type text primary key check (type ~ '^[a-z_]{1,40}$'),
  -- How the settings grid groups them.
  section text not null check (section in ('daily', 'people', 'group', 'partner', 'progress', 'leading', 'security')),
  sort integer not null,
  push_default boolean not null,
  email_default boolean not null,
  -- Skips snooze, quiet hours, digest and group mutes (partner SOS, security).
  urgent boolean not null default false,
  -- Can't be turned off (security alerts).
  locked boolean not null default false,
  -- May wait for the digest.
  digestible boolean not null default true,
  -- Email for this type is sent elsewhere (Supabase Auth and the security
  -- emails, D-030), so the pipeline never emails it.
  email_elsewhere boolean not null default false
);

comment on table public.notification_types is
  'Every notification type (§7.8) and its defaults (D-089). Changed with a migration.';

insert into public.notification_types
  (type, section, sort, push_default, email_default, urgent, locked, digestible, email_elsewhere) values
  ('daily_reminder', 'daily',    10, true,  false, false, false, false, false),
  ('streak_at_risk', 'daily',    20, true,  false, false, false, false, false),
  ('weekly_recap',   'daily',    30, false, false, false, false, false, false),
  ('nudge',          'people',   40, true,  false, false, false, true,  false),
  ('reaction',       'people',   50, false, false, false, false, true,  false),
  ('comment',        'people',   60, true,  false, false, false, true,  false),
  ('prayed_for_you', 'people',   70, true,  false, false, false, true,  false),
  ('prayer_request', 'group',    80, false, false, false, false, true,  false),
  ('announcement',   'group',    90, true,  false, false, false, true,  false),
  ('milestone',      'group',   100, false, false, false, false, true,  false),
  ('challenge',      'group',   110, true,  false, false, false, true,  false),
  ('covenant',       'group',   120, true,  false, false, false, true,  false),
  ('partner_request','partner', 130, true,  false, false, false, true,  false),
  ('partner_missed', 'partner', 140, true,  false, false, false, false, false),
  ('partner_sos',    'partner', 150, true,  false, true,  false, false, false),
  ('level_up',       'progress',160, false, false, false, false, true,  false),
  ('badge_earned',   'progress',170, false, false, false, false, true,  false),
  ('join_request',   'leading', 180, true,  false, false, false, true,  false),
  ('member_joined',  'leading', 190, false, false, false, false, true,  false),
  ('report',         'leading', 200, true,  false, false, false, true,  false),
  ('security',       'security',210, true,  true,  true,  true,  false, true);

alter table public.notification_types enable row level security;
create policy "notification_types: signed-in people read" on public.notification_types
  for select to authenticated using (true);
create policy "notification_types: live, verified session" on public.notification_types
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
revoke all on table public.notification_types from anon, authenticated;
grant select on table public.notification_types to authenticated;

insert into private.app_config (key, value, description) values
  ('notify_fanout_page', 500, 'Recipients one fan-out job handles before queueing the rest (D-089).'),
  ('notify_push_per_hour', 6, 'Pushes a person gets in an hour before the rest wait in the app (D-090).'),
  ('notify_email_per_hour', 3, 'Emails a person gets in an hour before the rest wait in the app (D-090).'),
  ('notify_keep_days', 90, 'Days a notification is kept (§11 retention).'),
  ('notify_digest_hour', 19, 'Local hour the daily and weekly digests go out (D-090).'),
  ('notify_at_risk_hour', 20, 'Local hour of the evening "still time today" reminder (D-091).'),
  ('notify_recap_hour', 18, 'Local hour of the Sunday recap (D-091).'),
  ('notify_comment_followers', 20, 'Earlier commenters told about a new comment on the same post.');

-- ---------------------------------------------------------------- notifications

create table public.notifications (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null references public.notification_types (type),
  group_id uuid references public.groups (id) on delete cascade,
  -- Who did it; cleared when their account is erased.
  actor_id uuid references public.profiles (id) on delete set null,
  -- Ids and small codes only (a reaction kind, a level number); never text.
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 512),
  -- The same event never notifies the same person twice.
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 160),
  -- Unread rows with the same fold key become one ("3 people reacted").
  fold_key text check (fold_key is null or char_length(fold_key) <= 160),
  fold_count integer not null default 1 check (fold_count >= 1),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;
create unique index notifications_fold_idx on public.notifications (user_id, fold_key)
  where fold_key is not null and read_at is null;
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);
create index notifications_list_idx on public.notifications (user_id, created_at desc, id desc);
create index notifications_unread_group_idx on public.notifications (user_id, group_id) where read_at is null;
create index notifications_group_idx on public.notifications (group_id) where group_id is not null;
create index notifications_actor_idx on public.notifications (actor_id) where actor_id is not null;
create index notifications_created_idx on public.notifications (created_at);

comment on table public.notifications is
  'In-app notifications (§7.8, D-089). The person reads their own; written only by the notify worker; kept 90 days.';

alter table public.notifications enable row level security;
create policy "notifications: owner reads" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: live, verified session" on public.notifications
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

-- ---------------------------------------------------------------- preferences and settings

-- Only choices that differ from the type's default are stored. In-app is
-- always on, so it has no row.
create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null references public.notification_types (type),
  channel text not null check (channel in ('push', 'email')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, type, channel)
);

alter table public.notification_preferences enable row level security;
create policy "notification_preferences: owner reads" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notification_preferences: live, verified session" on public.notification_preferences
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
revoke all on table public.notification_preferences from anon, authenticated;
grant select on table public.notification_preferences to authenticated;

alter table public.notification_settings
  add column digest text not null default 'off' check (digest in ('off', 'daily', 'weekly')),
  add column snooze_until timestamptz,
  add column sound boolean not null default true,
  add column vibrate boolean not null default true,
  -- The last digest's local date, so a digest goes out once per day or week.
  add column last_digest_on date;

-- Per-group mute (push and email; the bell still shows them). Next to the
-- nudge mute, which it doesn't replace (D-082).
alter table public.group_members
  add column notifications_muted boolean not null default false;

-- ---------------------------------------------------------------- push subscriptions

-- Filled by Phase 7c's subscribe route; the planner needs to know whether a
-- person has any device at all.
create table public.push_subscriptions (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  -- A coarse label ("Chrome on Android"), for the settings page.
  user_agent text check (user_agent is null or char_length(user_agent) <= 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Web Push subscriptions (§7.8). The person sees their own devices; keys never leave the server. Dead ones are removed at once.';

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: owner reads" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_subscriptions: live, verified session" on public.push_subscriptions
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
revoke all on table public.push_subscriptions from anon, authenticated;
grant select (id, user_agent, created_at, last_used_at) on table public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------- deliveries (the outbox)

create table private.notification_deliveries (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Null for a digest, which bundles several.
  notification_id uuid references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('push', 'email')),
  -- ready: waiting for the sender; held: until release_at (snooze, quiet
  -- hours); digest: waiting for the next digest; sending: claimed; sent;
  -- bundled: went out in a digest; skipped: not sent (reason); failed:
  -- gave up after five tries.
  status text not null check (status in ('ready', 'held', 'digest', 'sending', 'sent', 'bundled', 'skipped', 'failed')),
  reason text check (reason is null or reason ~ '^[a-z_0-9]{1,40}$'),
  release_at timestamptz,
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  bundle_count integer check (bundle_count is null or bundle_count >= 1),
  created_at timestamptz not null default now(),
  check ((status = 'held') = (release_at is not null)),
  check ((notification_id is null) = (bundle_count is not null))
);

create unique index notification_deliveries_once_idx
  on private.notification_deliveries (notification_id, channel) where notification_id is not null;
create index notification_deliveries_work_idx
  on private.notification_deliveries (status, release_at) where status in ('ready', 'held', 'sending');
create index notification_deliveries_digest_idx
  on private.notification_deliveries (user_id, channel) where status = 'digest';
create index notification_deliveries_recent_idx
  on private.notification_deliveries (user_id, channel, created_at desc);
create index notification_deliveries_created_idx on private.notification_deliveries (created_at);

comment on table private.notification_deliveries is
  'One row per notification and channel (push, email): the plan and the result (D-090). Never exposed through the API.';

-- ---------------------------------------------------------------- the queue

select pgmq.create('notify');
select pgmq.create('notify_dead');
revoke all on all tables in schema pgmq from public, anon, authenticated;
revoke all on all sequences in schema pgmq from public, anon, authenticated;

-- Queue an event. Payloads hold ids, dates and small codes only.
create or replace function private.notify(p_type text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_type not in ('nudge', 'reaction', 'comment', 'post', 'member', 'report', 'partnership', 'badge',
                    'level', 'challenge', 'covenant', 'security', 'partner_sos', 'direct') then
    raise exception 'notify_unknown_event';
  end if;
  perform pgmq.send('notify', jsonb_build_object('event', p_type) || coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function private.notify(text, jsonb) from public;

-- ---------------------------------------------------------------- the person's channel

create or replace function private.user_topic(p_user uuid, p_day date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'user:' || left(encode(extensions.hmac(convert_to('user:' || p_user::text || ':' || p_day::text, 'UTF8'),
                                                 (select k.secret from private.realtime_keys k where k.id = 1),
                                                 'sha256'), 'hex'), 40);
$$;

revoke all on function private.user_topic(uuid, date) from public;

-- Today's name of my own channel (content-free pings: "alerts changed").
create or replace function public.my_live_topic()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.user_topic(private.caller(), (now() at time zone 'utc')::date);
end;
$$;

revoke all on function public.my_live_topic() from public, anon;
grant execute on function public.my_live_topic() to authenticated;

create or replace function private.ping_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('what', 'alerts'), 'changed',
                        private.user_topic(p_user, (now() at time zone 'utc')::date), false);
end;
$$;

revoke all on function private.ping_user(uuid) from public;

-- ---------------------------------------------------------------- planning a channel

-- Is local time t inside quiet hours [s, e)? Equal start and end: no quiet hours.
create or replace function util.in_quiet_hours(t time, s time, e time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when s = e then false
              when s < e then t >= s and t < e
              else t >= s or t < e end;
$$;

grant execute on function util.in_quiet_hours(time, time, time) to authenticated, service_role;

-- When the quiet hours that contain p_now end, in the person's time zone.
create or replace function util.quiet_hours_end(p_now timestamptz, p_tz text, p_end time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when ((p_now at time zone p_tz)::date + p_end) at time zone p_tz > p_now
              then ((p_now at time zone p_tz)::date + p_end) at time zone p_tz
              else ((p_now at time zone p_tz)::date + 1 + p_end) at time zone p_tz end;
$$;

grant execute on function util.quiet_hours_end(timestamptz, text, time) to authenticated, service_role;

-- Is this channel on for this person and type? In-app has no switch.
create or replace function private.channel_on(p_user uuid, p_type text, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select t.locked or coalesce(
           (select p.enabled from public.notification_preferences p
             where p.user_id = p_user and p.type = p_type and p.channel = p_channel),
           case p_channel when 'push' then t.push_default else t.email_default end)
    from public.notification_types t where t.type = p_type;
$$;

revoke all on function private.channel_on(uuid, text, text) from public;

-- What to do with one channel for one notification, now. Null: nothing
-- (off, no device, emailed elsewhere, or a muted group). Rules, in order:
--   urgent types go now; a muted group sends nothing; snooze and quiet hours
--   hold it; digest mode bundles it; past the hourly limit it's skipped
--   (the bell still has it); otherwise it's ready.
create or replace function private.plan_channel(
  p_user uuid, p_type text, p_channel text, p_group uuid, p_now timestamptz default now(),
  out status text, out reason text, out release_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.notification_types;
  s public.notification_settings;
  v_tz text;
  v_sent integer;
begin
  select * into t from public.notification_types where type = p_type;
  if t.type is null or not private.channel_on(p_user, p_type, p_channel) then
    return;
  end if;
  if p_channel = 'email' and t.email_elsewhere then
    return;
  end if;
  if p_channel = 'push' and not exists (select 1 from public.push_subscriptions ps where ps.user_id = p_user) then
    return;
  end if;
  if t.urgent then
    status := 'ready';
    return;
  end if;
  if p_group is not null and exists (
    select 1 from public.group_members m
     where m.group_id = p_group and m.user_id = p_user and m.notifications_muted
  ) then
    return;
  end if;

  select * into s from public.notification_settings where user_id = p_user;
  select coalesce(p.timezone, 'UTC') into v_tz from public.profiles p where p.id = p_user;
  if s.snooze_until is not null and s.snooze_until > p_now then
    status := 'held'; reason := 'snoozed'; release_at := s.snooze_until;
    return;
  end if;
  if s.user_id is not null
     and util.in_quiet_hours((p_now at time zone v_tz)::time, s.quiet_hours_start, s.quiet_hours_end) then
    status := 'held'; reason := 'quiet_hours';
    release_at := util.quiet_hours_end(p_now, v_tz, s.quiet_hours_end);
    return;
  end if;
  if coalesce(s.digest, 'off') <> 'off' and t.digestible then
    status := 'digest'; reason := 'digest';
    return;
  end if;
  select count(*) into v_sent from private.notification_deliveries d
   where d.user_id = p_user and d.channel = p_channel and d.created_at > p_now - interval '1 hour'
     and d.status in ('ready', 'sending', 'sent');
  if v_sent >= util.config_int(case p_channel when 'push' then 'notify_push_per_hour' else 'notify_email_per_hour' end) then
    status := 'skipped'; reason := 'rate_limited';
    return;
  end if;
  status := 'ready';
end;
$$;

revoke all on function private.plan_channel(uuid, text, text, uuid, timestamptz) from public;

-- ---------------------------------------------------------------- writing notifications

-- Notify a set of people of one thing. Leaves out: the actor; anyone whose
-- account is closing or gone; a pair blocked either way; for a group's
-- event, anyone no longer an active member. Rows already notified
-- (dedupe_key) are skipped; with a fold_key, an unread row is folded into
-- instead ("3 people"). Plans each channel for the new rows and pings each
-- person once. Returns how many were notified.
create or replace function private.deliver(
  p_users uuid[],
  p_type text,
  p_group uuid,
  p_actor uuid,
  p_data jsonb,
  p_dedupe text,
  p_fold text default null,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with who as (
    select distinct u.uid
      from unnest(p_users) u(uid)
      join public.profiles p on p.id = u.uid and p.deleted_at is null and p.deletion_requested_at is null
     where u.uid is not null
       and u.uid is distinct from p_actor
       and (p_actor is null or not util.blocked_between(u.uid, p_actor))
       and (p_group is null or exists (
             select 1 from public.group_members m
              where m.group_id = p_group and m.user_id = u.uid and m.status = 'active'))
       and (p_dedupe is null or not exists (
             select 1 from public.notifications n where n.user_id = u.uid and n.dedupe_key = p_dedupe))
  ),
  ins as (
    insert into public.notifications as n (user_id, type, group_id, actor_id, data, dedupe_key, fold_key, created_at)
    select w.uid, p_type, p_group, p_actor, coalesce(p_data, '{}'::jsonb), p_dedupe, p_fold, p_now from who w
    on conflict (user_id, fold_key) where fold_key is not null and read_at is null
    do update set fold_count = n.fold_count + 1, actor_id = excluded.actor_id, created_at = excluded.created_at,
                  data = excluded.data
    returning n.id, n.user_id, (xmax = 0) as inserted
  ),
  -- A folded row keeps its first delivery; only new rows get one.
  planned as (
    insert into private.notification_deliveries (user_id, notification_id, channel, status, reason, release_at, created_at)
    select i.user_id, i.id, c.channel, pl.status, pl.reason, pl.release_at, p_now
      from ins i
     cross join (values ('push'), ('email')) c(channel)
     cross join lateral private.plan_channel(i.user_id, p_type, c.channel, p_group, p_now) pl
     where i.inserted and pl.status is not null
    returning 1
  ),
  pinged as (
    select private.ping_user(i.user_id) from ins i
  )
  select (select count(*) from ins) + 0 * (select count(*) from planned) + 0 * (select count(*) from pinged)
    into v_count;
  return v_count;
end;
$$;

revoke all on function private.deliver(uuid[], text, uuid, uuid, jsonb, text, text, timestamptz) from public;

-- Active members of a group, in id order after p_after, p_limit of them;
-- optionally only owners and admins.
create or replace function private.group_audience(p_group uuid, p_after uuid, p_limit integer, p_leaders boolean)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.user_id order by x.user_id), '{}')
    from (select m.user_id from public.group_members m
           where m.group_id = p_group and m.status = 'active'
             and (not p_leaders or m.role in ('owner', 'admin'))
             and (p_after is null or m.user_id > p_after)
           order by m.user_id
           limit p_limit) x;
$$;

revoke all on function private.group_audience(uuid, uuid, integer, boolean) from public;

-- ---------------------------------------------------------------- one job

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
      if r.id is null or not util.takes_nudges(r.group_id, r.to_user) then
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

-- The worker (pg_cron, every 5 seconds), like run_jobs (D-070): each job in
-- its own sub-transaction; a failure comes back after 30 seconds and goes to
-- notify_dead on the fifth; one worker at a time; about 4 seconds a run.
-- Then held deliveries whose time has come are planned again.
create or replace function private.run_notify(p_batch integer default 100, p_wait boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_done integer := 0;
  v_state text;
  v_text text;
  v_started timestamptz := clock_timestamp();
begin
  if p_wait then
    perform pg_advisory_xact_lock(hashtextextended('private.run_notify', 0));
  elsif not pg_try_advisory_xact_lock(hashtextextended('private.run_notify', 0)) then
    return 0;
  end if;

  for m in select * from pgmq.read('notify', 30, p_batch) loop
    begin
      perform private.run_notify_job(m.message);
      perform pgmq.delete('notify', m.msg_id);
      v_done := v_done + 1;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_text = message_text;
      if m.read_ct >= 5 then
        perform pgmq.send('notify_dead', m.message || jsonb_build_object(
          'failed_at', now(), 'tries', m.read_ct, 'sqlstate', v_state, 'error', left(v_text, 200)));
        perform pgmq.delete('notify', m.msg_id);
      end if;
    end;
    exit when clock_timestamp() - v_started > interval '4 seconds';
  end loop;

  perform private.release_held(now());
  return v_done;
end;
$$;

-- Held deliveries whose time has come: plan again (quiet hours may still
-- apply after a snooze ends, or digest mode may have been turned on).
create or replace function private.release_held(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  pl record;
  v_count integer := 0;
begin
  for d in
    select x.id, x.user_id, x.channel, n.type, n.group_id
      from private.notification_deliveries x
      join public.notifications n on n.id = x.notification_id
     where x.status = 'held' and x.release_at <= p_now
     order by x.release_at
     limit 500
     for update of x skip locked
  loop
    select * into pl from private.plan_channel(d.user_id, d.type, d.channel, d.group_id, p_now);
    update private.notification_deliveries
       set status = coalesce(pl.status, 'skipped'),
           reason = case when pl.status is null then 'turned_off' else pl.reason end,
           release_at = pl.release_at
     where id = d.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.release_held(timestamptz) from public;
revoke all on function private.run_notify(integer, boolean) from public;

select cron.schedule('notify-worker', '5 seconds', $$select private.run_notify()$$);

-- ---------------------------------------------------------------- the events

create or replace function private.notify_on_nudge()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('nudge', jsonb_build_object('nudge', new.id));
  return null;
end;
$$;

create or replace function private.notify_on_reaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('reaction', jsonb_build_object('reaction', new.id));
  return null;
end;
$$;

create or replace function private.notify_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('comment', jsonb_build_object('comment', new.id));
  return null;
end;
$$;

create or replace function private.notify_on_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('prayer_request', 'announcement', 'milestone') then
    perform private.notify('post', jsonb_build_object('post', new.id));
  end if;
  return null;
end;
$$;

-- Joining (or being approved), and asking to join.
create or replace function private.notify_on_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('active', 'pending') and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.role <> 'owner' then
    perform private.notify('member', jsonb_build_object('group', new.group_id, 'user', new.user_id));
  end if;
  return null;
end;
$$;

create or replace function private.notify_on_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('report', jsonb_build_object('report', new.id));
  return null;
end;
$$;

-- A request (to the person asked), an acceptance (to the one who asked), and
-- an ending by one partner (to the other). Lapsing, leaving, a block or a
-- closing account tell nobody.
create or replace function private.notify_on_partnership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.notify('partnership', jsonb_build_object('partnership', new.id, 'what', 'requested',
                                                              'actor', new.user_a));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then
    perform private.notify('partnership', jsonb_build_object('partnership', new.id, 'what', 'accepted',
                                                              'actor', new.user_b));
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'ended' and new.ended_reason = 'ended'
        and auth.uid() in (new.user_a, new.user_b) then
    perform private.notify('partnership', jsonb_build_object('partnership', new.id, 'what', 'ended',
                                                              'actor', auth.uid()));
  end if;
  return null;
end;
$$;

create or replace function private.notify_on_badge()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('badge', jsonb_build_object('user', new.user_id, 'badge', new.badge));
  return null;
end;
$$;

-- A level reached that's higher than before (never a level down, §7.6).
create or replace function private.notify_on_level()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.level > old.level then
    perform private.notify('level', jsonb_build_object(
      'user', new.user_id, 'level', new.level,
      'day', util.local_today(coalesce((select p.timezone from public.profiles p where p.id = new.user_id), 'UTC'))));
  end if;
  return null;
end;
$$;

create or replace function private.notify_on_covenant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('covenant', jsonb_build_object('proposal', new.id));
  return null;
end;
$$;

-- A new device (not the account's first), or a changed password.
create or replace function private.notify_on_new_device()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.known_devices k where k.user_id = new.user_id and k.id <> new.id) then
    perform private.notify('security', jsonb_build_object('user', new.user_id, 'what', 'new_login'));
  end if;
  return null;
end;
$$;

create or replace function private.notify_on_password()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.encrypted_password is not null and old.encrypted_password <> ''
     and new.encrypted_password is distinct from old.encrypted_password
     and exists (select 1 from public.profiles p where p.id = new.id) then
    perform private.notify('security', jsonb_build_object('user', new.id, 'what', 'password_changed'));
  end if;
  return null;
end;
$$;

-- A finished challenge (the hourly run records it once, D-071).
create or replace function private.notify_on_challenge_finished()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('challenge', jsonb_build_object('group', new.group_id, 'phase', 'end',
                                                          'day', new.end_date));
  return null;
end;
$$;

create trigger nudges_notify after insert on public.nudges
  for each row execute function private.notify_on_nudge();
create trigger reactions_notify after insert on public.reactions
  for each row execute function private.notify_on_reaction();
create trigger comments_notify after insert on public.comments
  for each row execute function private.notify_on_comment();
create trigger posts_notify after insert on public.posts
  for each row execute function private.notify_on_post();
create trigger group_members_notify after insert or update of status on public.group_members
  for each row execute function private.notify_on_membership();
create trigger reports_notify after insert on public.reports
  for each row execute function private.notify_on_report();
create trigger partnerships_notify after insert or update of status on public.partnerships
  for each row execute function private.notify_on_partnership();
create trigger user_badges_notify after insert on public.user_badges
  for each row execute function private.notify_on_badge();
create trigger user_stats_notify_level after update of level on public.user_stats
  for each row execute function private.notify_on_level();
create trigger covenant_proposals_notify after insert on public.group_covenant_proposals
  for each row execute function private.notify_on_covenant();
create trigger known_devices_notify after insert on private.known_devices
  for each row execute function private.notify_on_new_device();
create trigger auth_users_notify_password after update of encrypted_password on auth.users
  for each row execute function private.notify_on_password();
create trigger challenge_finish_runs_notify after insert on private.challenge_finish_runs
  for each row execute function private.notify_on_challenge_finished();

revoke all on function private.notify_on_nudge() from public;
revoke all on function private.notify_on_reaction() from public;
revoke all on function private.notify_on_comment() from public;
revoke all on function private.notify_on_post() from public;
revoke all on function private.notify_on_membership() from public;
revoke all on function private.notify_on_report() from public;
revoke all on function private.notify_on_partnership() from public;
revoke all on function private.notify_on_badge() from public;
revoke all on function private.notify_on_level() from public;
revoke all on function private.notify_on_covenant() from public;
revoke all on function private.notify_on_new_device() from public;
revoke all on function private.notify_on_password() from public;
revoke all on function private.notify_on_challenge_finished() from public;

-- Partner SOS (Phase 8's button calls this): urgent, through quiet hours.
create or replace function public.send_partner_sos(p_group uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if p_group is not null then
    perform private.social_member(p_group, true);
  elsif not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'partner_sos', 5, interval '1 hour');
  perform private.notify('partner_sos', jsonb_build_object('user', v_uid, 'group', p_group));
end;
$$;

revoke all on function public.send_partner_sos(uuid) from public, anon;
grant execute on function public.send_partner_sos(uuid) to authenticated;

-- ---------------------------------------------------------------- what goes when

-- Leaving a group (or being removed) takes that group's notifications with
-- it: groups are isolated (§2.4).
create or replace function private.notifications_forget_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.status = 'removed' then
    delete from public.notifications n where n.user_id = old.user_id and n.group_id = old.group_id;
  end if;
  return null;
end;
$$;

create trigger group_members_forget_notifications after delete or update of status on public.group_members
  for each row execute function private.notifications_forget_group();

-- A block removes what each was told about the other.
create or replace function private.notifications_forget_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications n
   where (n.user_id = new.blocker_id and n.actor_id = new.blocked_id)
      or (n.user_id = new.blocked_id and n.actor_id = new.blocker_id);
  return null;
end;
$$;

create trigger blocks_forget_notifications after insert on public.blocks
  for each row execute function private.notifications_forget_block();

-- Closing an account stops its waiting deliveries (the jobs skip it too).
create or replace function private.notifications_on_closing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deletion_requested_at is not null and old.deletion_requested_at is null then
    update private.notification_deliveries
       set status = 'skipped', reason = 'account_closing', release_at = null
     where user_id = new.id and status in ('ready', 'held', 'digest');
  end if;
  return null;
end;
$$;

create trigger profiles_closing_notifications after update of deletion_requested_at on public.profiles
  for each row execute function private.notifications_on_closing();

-- Erasing an account removes its notification jobs (ids only) too.
create or replace function private.forget_notify_jobs_for_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from pgmq.q_notify where message ->> 'user' = old.id::text or message ->> 'actor' = old.id::text;
  delete from pgmq.q_notify_dead where message ->> 'user' = old.id::text or message ->> 'actor' = old.id::text;
  return null;
end;
$$;

create trigger profiles_forget_notify_jobs after delete on public.profiles
  for each row execute function private.forget_notify_jobs_for_profile();

revoke all on function private.notifications_forget_group() from public;
revoke all on function private.notifications_forget_block() from public;
revoke all on function private.notifications_on_closing() from public;
revoke all on function private.forget_notify_jobs_for_profile() from public;

-- ---------------------------------------------------------------- reading and marking

-- My notifications, newest first, a page at a time (cursor: the last row's
-- time and id; a folded row moves up when it's bumped). The
-- actor shows only while neither has blocked the other; the group's name
-- only while I'm still in it.
create or replace function public.my_notifications(
  p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 30
)
returns table (
  id uuid, type text, group_id uuid, group_name text, actor_id uuid, data jsonb,
  fold_count integer, read_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  select n.id, n.type, n.group_id,
         (select g.name from public.groups g
           where g.id = n.group_id and exists (
             select 1 from public.group_members m
              where m.group_id = g.id and m.user_id = v_uid and m.status = 'active')),
         case when n.actor_id is not null and not util.blocked_between(v_uid, n.actor_id) then n.actor_id end,
         n.data, n.fold_count, n.read_at, n.created_at
    from public.notifications n
   where n.user_id = v_uid
     and (p_before_at is null or (n.created_at, n.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by n.created_at desc, n.id desc
   limit p_limit;
end;
$$;

revoke all on function public.my_notifications(timestamptz, uuid, integer) from public, anon;
grant execute on function public.my_notifications(timestamptz, uuid, integer) to authenticated;

-- Unread counts: one row per group (and one with no group), for the bell and
-- the group switcher.
create or replace function public.my_unread_counts()
returns table (group_id uuid, unread integer)
language sql
stable
security definer
set search_path = ''
as $$
  select n.group_id, count(*)::integer
    from public.notifications n
   where n.user_id = auth.uid() and n.read_at is null and util.session_ok()
   group by n.group_id;
$$;

revoke all on function public.my_unread_counts() from public, anon;
grant execute on function public.my_unread_counts() to authenticated;

-- Mark some (or, with null, all) of my notifications read.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  v_count integer;
begin
  if p_ids is not null and cardinality(p_ids) > 100 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'notifications_read', 240, interval '1 hour');
  update public.notifications n set read_at = now()
   where n.user_id = v_uid and n.read_at is null and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.ping_user(v_uid);
  end if;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------- settings

-- The type-by-channel grid, saved in one go: [{type, channel, enabled}, ...].
-- Locked types can't be turned off; a choice equal to the default is
-- simply forgotten.
create or replace function public.set_notification_preferences(p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  e jsonb;
  t public.notification_types;
  v_channel text;
  v_enabled boolean;
begin
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'array' or jsonb_array_length(p_prefs) > 100 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'notification_settings', 60, interval '1 hour');
  for e in select * from jsonb_array_elements(p_prefs) loop
    select * into t from public.notification_types where type = e ->> 'type';
    v_channel := e ->> 'channel';
    v_enabled := (e ->> 'enabled')::boolean;
    if t.type is null or v_channel is null or v_channel not in ('push', 'email') or v_enabled is null then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    if t.locked then
      if not v_enabled then
        raise exception 'notification_locked';
      end if;
      continue;
    end if;
    if v_enabled = (case v_channel when 'push' then t.push_default else t.email_default end) then
      delete from public.notification_preferences
       where user_id = v_uid and type = t.type and channel = v_channel;
    else
      insert into public.notification_preferences (user_id, type, channel, enabled)
      values (v_uid, t.type, v_channel, v_enabled)
      on conflict (user_id, type, channel) do update set enabled = excluded.enabled, updated_at = now();
    end if;
  end loop;
end;
$$;

revoke all on function public.set_notification_preferences(jsonb) from public, anon;
grant execute on function public.set_notification_preferences(jsonb) to authenticated;

-- Quiet hours, digest, sound and vibration, and discreet mode.
create or replace function public.update_notification_settings(
  p_quiet_start time, p_quiet_end time, p_digest text, p_discreet boolean, p_sound boolean, p_vibrate boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if p_quiet_start is null or p_quiet_end is null or p_digest is null or p_digest not in ('off', 'daily', 'weekly')
     or p_discreet is null or p_sound is null or p_vibrate is null
     or extract(second from p_quiet_start) <> 0 or extract(second from p_quiet_end) <> 0 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'notification_settings', 60, interval '1 hour');
  insert into public.notification_settings as s
    (user_id, quiet_hours_start, quiet_hours_end, digest, discreet_mode, sound, vibrate)
  values (v_uid, p_quiet_start, p_quiet_end, p_digest, p_discreet, p_sound, p_vibrate)
  on conflict (user_id) do update set
    quiet_hours_start = excluded.quiet_hours_start, quiet_hours_end = excluded.quiet_hours_end,
    digest = excluded.digest, discreet_mode = excluded.discreet_mode,
    sound = excluded.sound, vibrate = excluded.vibrate;
  -- Turning the digest off sends what was waiting for it, as planned now.
  if p_digest = 'off' then
    update private.notification_deliveries
       set status = 'held', reason = 'digest_off', release_at = now()
     where user_id = v_uid and status = 'digest';
  end if;
end;
$$;

revoke all on function public.update_notification_settings(time, time, text, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.update_notification_settings(time, time, text, boolean, boolean, boolean)
  to authenticated;

-- "Snooze everything" for a day or a week, or wake up now. Partner SOS and
-- security alerts still come through.
create or replace function public.snooze_notifications(p_for text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  v_until timestamptz;
begin
  if p_for is null or p_for not in ('day', 'week', 'off') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'notification_settings', 60, interval '1 hour');
  v_until := case p_for when 'day' then now() + interval '1 day' when 'week' then now() + interval '7 days' end;
  insert into public.notification_settings as s (user_id, snooze_until) values (v_uid, v_until)
  on conflict (user_id) do update set snooze_until = excluded.snooze_until;
  -- Waking up early releases what was held for the snooze.
  update private.notification_deliveries
     set release_at = coalesce(v_until, now())
   where user_id = v_uid and status = 'held' and reason = 'snoozed';
  return v_until;
end;
$$;

revoke all on function public.snooze_notifications(text) from public, anon;
grant execute on function public.snooze_notifications(text) to authenticated;

-- Mute (or unmute) one group's push and email; the bell still shows them.
create or replace function public.set_group_notifications_muted(p_group uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  if p_muted is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select caller_id into v_uid from private.social_member(p_group, false);
  perform private.throttle(v_uid, 'notification_settings', 60, interval '1 hour');
  update public.group_members set notifications_muted = p_muted
   where group_id = p_group and user_id = v_uid and status = 'active';
end;
$$;

revoke all on function public.set_group_notifications_muted(uuid, boolean) from public, anon;
grant execute on function public.set_group_notifications_muted(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- export

-- "Download my data": my notifications (ids and codes), my choices, my devices
-- (labels only; no endpoints or keys).
create or replace function public.my_notifications_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  return jsonb_build_object(
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('type', n.type, 'group_id', n.group_id, 'data', n.data,
                                          'count', n.fold_count, 'read_at', n.read_at, 'created_at', n.created_at)
                       order by n.created_at)
        from public.notifications n where n.user_id = v_uid), '[]'::jsonb),
    'preferences', coalesce((
      select jsonb_agg(jsonb_build_object('type', p.type, 'channel', p.channel, 'enabled', p.enabled)
                       order by p.type, p.channel)
        from public.notification_preferences p where p.user_id = v_uid), '[]'::jsonb),
    'muted_groups', coalesce((
      select jsonb_agg(m.group_id) from public.group_members m
       where m.user_id = v_uid and m.notifications_muted), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('device', s.user_agent, 'added', s.created_at, 'last_used', s.last_used_at)
                       order by s.created_at)
        from public.push_subscriptions s where s.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_notifications_export() from public, anon;
grant execute on function public.my_notifications_export() to authenticated;
