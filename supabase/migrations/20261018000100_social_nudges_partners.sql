-- social: nudges, accountability partners and milestone cards (CLAUDE.md
-- §7.7, §3). Phase 6b; see D-082 to D-085.
--
-- Nudges: one per sender per recipient per day, enforced by a unique index
-- (so rapid repeated requests can't get past it), on top of private.throttle.
-- Recipients can mute nudges everywhere or in one group.
--
-- Partners: a mutual opt-in inside one group, at most two active partners per
-- person per group (owner, 2026-10-12). Partners see each other's full
-- check-in detail in that group (mood, urges, triggers). Each person chooses
-- whether their partner may be alerted when they miss two days or press SOS
-- (the alerts themselves arrive with notifications and SOS, Phases 7–8).
-- A partnership ends when either person leaves or is removed, blocks the
-- other, or starts closing their account.
--
-- Milestone cards: when a member earns a free-days badge from 7 days up, a
-- card is posted to each group where they share their streak or more, unless
-- they turned milestone cards off (owner, 2026-10-12).

-- ---------------------------------------------------------------- settings

alter table public.privacy_settings
  add column milestone_cards boolean not null default true,
  add column nudges_muted boolean not null default false;

grant update (milestone_cards, nudges_muted) on table public.privacy_settings to authenticated;

alter table public.group_members
  add column nudges_muted boolean not null default false;

insert into private.app_config (key, value, description) values
  ('partners_max_per_group', 2, 'Active accountability partners a person may have in one group (owner, 2026-10-12).'),
  ('partner_request_days', 14, 'Days a partner request stays open before it lapses.'),
  ('milestone_card_min_days', 7, 'The smallest free-days badge that posts a milestone card (owner, 2026-10-12).');

-- ---------------------------------------------------------------- nudges

create table public.nudges (
  id uuid primary key default util.uuid_v7(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('praying', 'check_in', 'got_this', 'call_me', 'pray_for_me')),
  -- The sender's own day: one nudge per sender, recipient and day, in any group.
  sender_day date not null,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create unique index nudges_once_a_day_idx on public.nudges (from_user, to_user, sender_day);
create index nudges_to_idx on public.nudges (to_user, created_at desc);
create index nudges_group_idx on public.nudges (group_id);

comment on table public.nudges is
  'Nudges (§7.7, D-082): one per sender, recipient and day (a unique index). The sender and recipient read their own; written only by send_nudge().';

alter table public.nudges enable row level security;
revoke all on table public.nudges from anon, authenticated;
grant select on table public.nudges to authenticated;

create policy "nudges: sender and recipient read" on public.nudges
  for select to authenticated
  using (
    ((select auth.uid()) in (from_user, to_user))
    and util.group_status(group_id) = 'active'
    and not util.blocked_between(from_user, to_user)
  );
create policy "nudges: live, verified session" on public.nudges
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- Does this person take nudges in this group?
create or replace function util.takes_nudges(p_user uuid, p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((select s.nudges_muted from public.privacy_settings s where s.user_id = p_user), false)
     and not coalesce((select m.nudges_muted from public.group_members m
                        where m.group_id = p_group and m.user_id = p_user), false);
$$;

revoke all on function util.takes_nudges(uuid, uuid) from public, anon;
grant execute on function util.takes_nudges(uuid, uuid) to authenticated, service_role;

-- Send one nudge. Refused for yourself, across a block, to someone not in the
-- group, to someone who muted nudges, and for a second nudge to the same
-- person on the same day (nudge_already_sent): the unique index holds that
-- line even under many requests at once.
create or replace function public.send_nudge(p_group uuid, p_to uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_tz text;
  v_id uuid;
begin
  select * into c from private.social_member(p_group, true);
  if p_kind is null or p_kind not in ('praying', 'check_in', 'got_this', 'call_me', 'pray_for_me')
     or p_to is null or p_to = c.caller_id then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.group_members m
                  where m.group_id = p_group and m.user_id = p_to and m.status = 'active')
     or not util.account_open(p_to) or util.blocked_between(c.caller_id, p_to) then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  if not util.takes_nudges(p_to, p_group) then
    raise exception 'nudges_muted';
  end if;
  perform private.throttle(c.caller_id, 'nudge', 60, interval '1 hour');
  select p.timezone into v_tz from public.profiles p where p.id = c.caller_id;
  insert into public.nudges (group_id, from_user, to_user, kind, sender_day)
  values (p_group, c.caller_id, p_to, p_kind, util.local_today(coalesce(v_tz, 'UTC')))
  on conflict (from_user, to_user, sender_day) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'nudge_already_sent';
  end if;
  perform private.queue_encouragement(c.caller_id, p_group, 'nudge:' || v_id);
  return v_id;
end;
$$;

-- The group's members I can nudge right now, and whom I've nudged today.
-- People who muted nudges, people blocked either way, and closing accounts
-- are left out.
create or replace function public.group_nudge_targets(p_group uuid)
returns table (user_id uuid, sent_today boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  v_day date;
begin
  select * into c from private.social_member(p_group, false);
  select util.local_today(coalesce(p.timezone, 'UTC')) into v_day from public.profiles p where p.id = c.caller_id;
  return query
  select m.user_id,
         exists (select 1 from public.nudges n
                  where n.from_user = c.caller_id and n.to_user = m.user_id and n.sender_day = v_day)
    from public.group_members m
   where m.group_id = p_group and m.status = 'active' and m.user_id <> c.caller_id
     and util.account_open(m.user_id) and not util.blocked_between(c.caller_id, m.user_id)
     and util.takes_nudges(m.user_id, p_group);
end;
$$;

-- Nudges I received in the last few days, newest first (people blocked
-- either way and closing accounts left out).
create or replace function public.my_nudges(p_group uuid default null, p_days integer default 3)
returns table (id uuid, group_id uuid, from_user uuid, kind text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if p_days is null or p_days not between 1 and 30 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_group is not null then
    perform private.social_member(p_group, false);
  end if;
  return query
  select n.id, n.group_id, n.from_user, n.kind, n.created_at
    from public.nudges n
    join public.group_members m on m.group_id = n.group_id and m.user_id = v_uid and m.status = 'active'
   where n.to_user = v_uid and n.created_at > now() - make_interval(days => p_days)
     and (p_group is null or n.group_id = p_group)
     and util.account_open(n.from_user) and not util.blocked_between(v_uid, n.from_user)
   order by n.created_at desc
   limit 50;
end;
$$;

-- Mute (or unmute) nudges in one group. Muting everywhere is
-- privacy_settings.nudges_muted, which the person updates directly.
create or replace function public.set_group_nudges_muted(p_group uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.social_member(p_group, false);
  if p_muted is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(c.caller_id, 'group_manage', 150, interval '1 hour');
  update public.group_members set nudges_muted = p_muted where group_id = p_group and user_id = c.caller_id;
end;
$$;

-- ---------------------------------------------------------------- partners

create table public.partnerships (
  id uuid primary key default util.uuid_v7(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- The person who asked, and the person asked.
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  -- Each person's own choice: may my partner be alerted when I miss two days or press SOS?
  a_allows_alerts boolean not null default false,
  b_allows_alerts boolean not null default false,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  -- Why it ended: ended (by one of them), declined, withdrawn, lapsed, left, blocked, closing.
  ended_reason text check (ended_reason in ('ended', 'declined', 'withdrawn', 'lapsed', 'left', 'blocked', 'closing')),
  check (user_a <> user_b),
  check ((status = 'ended') = (ended_at is not null)),
  check (status <> 'active' or (accepted_at is not null and ended_at is null))
);

-- One open (pending or active) partnership per pair in a group, whoever asked.
create unique index partnerships_one_open_idx
  on public.partnerships (group_id, least(user_a, user_b), greatest(user_a, user_b))
  where status <> 'ended';
create index partnerships_a_idx on public.partnerships (user_a) where status <> 'ended';
create index partnerships_b_idx on public.partnerships (user_b) where status <> 'ended';

comment on table public.partnerships is
  'Accountability partners (§3, §7.7, D-083): a mutual opt-in inside one group. The two people read their own rows; written only by the partner functions.';

alter table public.partnerships enable row level security;
revoke all on table public.partnerships from anon, authenticated;
grant select on table public.partnerships to authenticated;

create policy "partnerships: the two people read" on public.partnerships
  for select to authenticated
  using (
    (select auth.uid()) in (user_a, user_b)
    and util.group_status(group_id) = 'active'
    and not util.blocked_between(user_a, user_b)
  );
create policy "partnerships: live, verified session" on public.partnerships
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- Partners in this group: an active partnership, both still active members.
create or replace function util.are_partners_in(p_group uuid, a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.partnerships p
     where p.group_id = p_group and p.status = 'active'
       and ((p.user_a = a and p.user_b = b) or (p.user_a = b and p.user_b = a))
  );
$$;

-- Partners in any group they still share (replaces the Phase 2 stand-in,
-- which was always false). Used by profile visibility ("partners only").
create or replace function util.are_partners(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and owner is not null and viewer <> owner and exists (
    select 1 from public.partnerships p
     where p.status = 'active'
       and ((p.user_a = viewer and p.user_b = owner) or (p.user_a = owner and p.user_b = viewer))
  );
$$;

revoke all on function util.are_partners_in(uuid, uuid, uuid) from public, anon;
grant execute on function util.are_partners_in(uuid, uuid, uuid) to authenticated, service_role;

-- Ends every open partnership matching the filter, with a reason.
create or replace function private.end_partnerships(p_group uuid, p_user uuid, p_other uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.partnerships
     set status = 'ended', ended_at = now(), ended_reason = p_reason
   where status <> 'ended'
     and (p_group is null or group_id = p_group)
     and p_user in (user_a, user_b)
     and (p_other is null or p_other in (user_a, user_b));
$$;

revoke all on function private.end_partnerships(uuid, uuid, uuid, text) from public;

-- How many open (or active only) partnerships a person has in a group.
create or replace function private.partner_count(p_group uuid, p_user uuid, p_active_only boolean)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.partnerships p
   where p.group_id = p_group and p_user in (p.user_a, p.user_b)
     and (p.status = 'active' or (not p_active_only and p.status = 'pending'
                                  and p.requested_at > now() - make_interval(days => util.config_int('partner_request_days'))));
$$;

revoke all on function private.partner_count(uuid, uuid, boolean) from public;

-- Ask someone in the group to be partners.
create or replace function public.request_partner(p_group uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_id uuid;
  v_max integer := util.config_int('partners_max_per_group');
begin
  select * into c from private.social_member(p_group, true);
  if p_user is null or p_user = c.caller_id then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.group_members m
                  where m.group_id = p_group and m.user_id = p_user and m.status = 'active')
     or not util.account_open(p_user) or util.blocked_between(c.caller_id, p_user) then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  perform private.throttle(c.caller_id, 'partner', 25, interval '1 day');
  -- Requests nobody answered lapse.
  update public.partnerships
     set status = 'ended', ended_at = now(), ended_reason = 'lapsed'
   where group_id = p_group and status = 'pending'
     and requested_at <= now() - make_interval(days => util.config_int('partner_request_days'));
  if exists (select 1 from public.partnerships p
              where p.group_id = p_group and p.status <> 'ended'
                and ((p.user_a = c.caller_id and p.user_b = p_user) or (p.user_a = p_user and p.user_b = c.caller_id))) then
    raise exception 'partner_already';
  end if;
  if private.partner_count(p_group, c.caller_id, false) >= v_max then
    raise exception 'partners_full';
  end if;
  insert into public.partnerships (group_id, user_a, user_b) values (p_group, c.caller_id, p_user)
  returning id into v_id;
  return v_id;
end;
$$;

-- The person asked accepts or declines; the one who asked can withdraw.
create or replace function public.respond_partner(p_partnership uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.partnerships;
  v_max integer := util.config_int('partners_max_per_group');
begin
  select * into p from public.partnerships where id = p_partnership for update;
  if p.id is null or v_uid not in (p.user_a, p.user_b) or util.blocked_between(p.user_a, p.user_b) then
    raise exception 'partnership_not_found' using errcode = '42501';
  end if;
  perform private.social_member(p.group_id, true);
  if p_accept is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'partner', 25, interval '1 day');
  if p.status <> 'pending'
     or p.requested_at <= now() - make_interval(days => util.config_int('partner_request_days')) then
    raise exception 'partner_request_closed';
  end if;
  if v_uid = p.user_a then
    if p_accept then
      raise exception 'group_forbidden' using errcode = '42501';
    end if;
    update public.partnerships set status = 'ended', ended_at = now(), ended_reason = 'withdrawn' where id = p.id;
    return;
  end if;
  if not p_accept then
    update public.partnerships set status = 'ended', ended_at = now(), ended_reason = 'declined' where id = p.id;
    return;
  end if;
  if not exists (select 1 from public.group_members m
                  where m.group_id = p.group_id and m.user_id = p.user_a and m.status = 'active') then
    raise exception 'partner_request_closed';
  end if;
  perform 1 from public.groups g where g.id = p.group_id for update;
  if private.partner_count(p.group_id, p.user_a, true) >= v_max
     or private.partner_count(p.group_id, p.user_b, true) >= v_max then
    raise exception 'partners_full';
  end if;
  update public.partnerships set status = 'active', accepted_at = now() where id = p.id;
end;
$$;

-- Either partner ends it, at any time; nobody else is told why.
create or replace function public.end_partnership(p_partnership uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.partnerships;
begin
  select * into p from public.partnerships where id = p_partnership;
  if p.id is null or v_uid not in (p.user_a, p.user_b) then
    raise exception 'partnership_not_found' using errcode = '42501';
  end if;
  perform private.social_member(p.group_id, false);
  perform private.throttle(v_uid, 'partner', 25, interval '1 day');
  if p.status = 'ended' then
    return;
  end if;
  update public.partnerships set status = 'ended', ended_at = now(), ended_reason = 'ended' where id = p.id;
end;
$$;

-- My own choice about alerts for this partnership.
create or replace function public.set_partner_alerts(p_partnership uuid, p_allow boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.partnerships;
begin
  select * into p from public.partnerships where id = p_partnership;
  if p.id is null or v_uid not in (p.user_a, p.user_b) or p.status = 'ended' then
    raise exception 'partnership_not_found' using errcode = '42501';
  end if;
  perform private.social_member(p.group_id, false);
  if p_allow is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'partner', 25, interval '1 day');
  if v_uid = p.user_a then
    update public.partnerships set a_allows_alerts = p_allow where id = p.id;
  else
    update public.partnerships set b_allows_alerts = p_allow where id = p.id;
  end if;
end;
$$;

-- My partnerships in a group: who, whether I asked, the status, and both
-- people's alert choices.
create or replace function public.my_partnerships(p_group uuid)
returns table (
  id uuid, partner_id uuid, asked_by_me boolean, status text, i_allow_alerts boolean,
  partner_allows_alerts boolean, requested_at timestamptz, accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.social_member(p_group, false);
  return query
  select p.id,
         case when p.user_a = c.caller_id then p.user_b else p.user_a end,
         p.user_a = c.caller_id,
         p.status,
         case when p.user_a = c.caller_id then p.a_allows_alerts else p.b_allows_alerts end,
         case when p.user_a = c.caller_id then p.b_allows_alerts else p.a_allows_alerts end,
         p.requested_at, p.accepted_at
    from public.partnerships p
   where p.group_id = p_group and c.caller_id in (p.user_a, p.user_b) and p.status <> 'ended'
     and (p.status = 'active'
          or p.requested_at > now() - make_interval(days => util.config_int('partner_request_days')))
     and util.account_open(case when p.user_a = c.caller_id then p.user_b else p.user_a end)
     and not util.blocked_between(p.user_a, p.user_b)
   order by p.status, p.requested_at;
end;
$$;

-- ---------------------------------------------------------------- what ends a partnership

-- Leaving or being removed ends that group's partnerships (and leaving
-- deletes the membership row, D-038).
create or replace function private.partnerships_on_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.end_partnerships(old.group_id, old.user_id, null, 'left');
    return null;
  end if;
  if old.status = 'active' and new.status <> 'active' then
    perform private.end_partnerships(new.group_id, new.user_id, null, 'left');
  end if;
  return null;
end;
$$;

create trigger group_members_partnerships
  after update of status or delete on public.group_members
  for each row execute function private.partnerships_on_membership();

-- A block ends partnerships between the two, and their nudges go.
create or replace function private.partnerships_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.end_partnerships(null, new.blocker_id, new.blocked_id, 'blocked');
  delete from public.nudges
   where (from_user = new.blocker_id and to_user = new.blocked_id)
      or (from_user = new.blocked_id and to_user = new.blocker_id);
  return null;
end;
$$;

create trigger blocks_end_partnerships
  after insert on public.blocks
  for each row execute function private.partnerships_on_block();

-- Starting to close an account ends its partnerships (D-033, D-066).
create or replace function private.partnerships_on_closing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.end_partnerships(null, new.id, null, 'closing');
  return null;
end;
$$;

create trigger profiles_closing_end_partnerships
  after update of deletion_requested_at on public.profiles
  for each row when (old.deletion_requested_at is null and new.deletion_requested_at is not null)
  execute function private.partnerships_on_closing();

revoke all on function private.partnerships_on_membership() from public;
revoke all on function private.partnerships_on_block() from public;
revoke all on function private.partnerships_on_closing() from public;

-- ---------------------------------------------------------------- what groups see

-- As in 6a, but partners see each other's detail only in the group where
-- they are partners.
create or replace view public.group_checkins_today
with (security_barrier = true)
as
select
  m.group_id,
  m.user_id,
  (c.id is not null) as checked_in_today,
  case when v.rank >= 1 then util.live_count(s.current_streak, s.last_checkin_date, p.timezone) end as current_streak,
  case when v.rank >= 2 then c.outcome end as outcome,
  case when v.rank >= 3 then c.mood end as mood,
  case when v.rank >= 3 then c.urge_level end as urge_level,
  case when v.rank >= 3 then c.triggers end as triggers,
  case when v.rank >= 1 then util.member_level(m.user_id) end as level
from public.group_members m
join public.profiles p
  on p.id = m.user_id and p.deleted_at is null and p.deletion_requested_at is null
left join public.checkins c
  on c.user_id = m.user_id and c.local_date = util.local_today(p.timezone)
left join public.user_stats s
  on s.user_id = m.user_id
cross join lateral (
  select case
    when m.user_id = auth.uid() or util.are_partners_in(m.group_id, auth.uid(), m.user_id) then 3
    else util.share_rank(m.share_level)
  end as rank
) v
where m.status = 'active'
  and util.session_ok()
  and not util.blocked_between(auth.uid(), m.user_id)
  and m.group_id in (
    select me.group_id from public.group_members me
     where me.user_id = auth.uid() and me.status = 'active'
  );

-- ---------------------------------------------------------------- milestone cards

create unique index posts_one_milestone_idx on public.posts (group_id, author_id, badge) where kind = 'milestone';

-- A free-days badge from 7 days up posts a card to each group where the
-- member shares their streak or more, unless they turned the cards off. The
-- card is the badge itself (no text); everyone in the group can react to it.
create or replace function private.post_milestone_cards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.badges b
     where b.slug = new.badge and b.kind = 'free_days' and b.threshold >= util.config_int('milestone_card_min_days')
  ) or not coalesce((select s.milestone_cards from public.privacy_settings s where s.user_id = new.user_id), true)
    or not util.account_open(new.user_id) then
    return null;
  end if;
  insert into public.posts (group_id, author_id, kind, badge)
  select m.group_id, new.user_id, 'milestone', new.badge
    from public.group_members m
    join public.groups g on g.id = m.group_id and g.archived_at is null
   where m.user_id = new.user_id and m.status = 'active' and util.share_rank(m.share_level) >= 1
  on conflict (group_id, author_id, badge) where kind = 'milestone' do nothing;
  return null;
end;
$$;

create trigger user_badges_milestone_cards
  after insert on public.user_badges
  for each row execute function private.post_milestone_cards();

revoke all on function private.post_milestone_cards() from public;

-- A milestone card shows only while its member still shares their streak or
-- more there and keeps the cards on (a card hints at a streak, like a badge).
create or replace function util.milestone_visible(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
     and coalesce((select s.milestone_cards from public.privacy_settings s where s.user_id = p_user), true)
     and exists (select 1 from public.group_members m
                  where m.group_id = p_group and m.user_id = p_user and m.status = 'active'
                    and util.share_rank(m.share_level) >= 1);
$$;

revoke all on function util.milestone_visible(uuid, uuid) from public, anon;
grant execute on function util.milestone_visible(uuid, uuid) to authenticated, service_role;

drop policy "posts: members read" on public.posts;
create policy "posts: members read" on public.posts
  for select to authenticated
  using (
    util.group_status(group_id) = 'active' and deleted_at is null
    and (author_id is null or (util.account_open(author_id)
                               and not util.blocked_between((select auth.uid()), author_id)))
    and (kind <> 'milestone' or util.milestone_visible(group_id, author_id))
  );

-- As in 6a, plus: milestone cards only while their member still shares their
-- streak there and keeps the cards on.
create or replace function private.visible_post(p_post uuid, p_caller uuid)
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
  if p.id is null or p.deleted_at is not null
     or not exists (select 1 from public.group_members m
                     where m.group_id = p.group_id and m.user_id = p_caller and m.status = 'active')
     or (p.author_id is not null and (not util.account_open(p.author_id)
                                      or util.blocked_between(p_caller, p.author_id)))
     or (p.kind = 'milestone' and not util.milestone_visible(p.group_id, p.author_id)) then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  return p;
end;
$$;

create or replace function private.wall_rows(
  p_caller uuid, p_group uuid, p_kind text, p_before uuid, p_limit integer, p_post uuid
)
returns table (
  id uuid, kind text, author_id uuid, body text, badge text, pinned boolean,
  created_at timestamptz, edited_at timestamptz, comment_count bigint,
  reactions jsonb, my_reactions text[], is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blocked uuid[] := util.block_set(p_caller);
begin
  return query
  select p.id, p.kind, p.author_id, p.body, p.badge, p.pinned, p.created_at, p.edited_at,
         (select count(*) from public.comments x
            left join public.profiles xa on xa.id = x.author_id
           where x.post_id = p.id and x.deleted_at is null
             and (x.author_id is null or (xa.deletion_requested_at is null and xa.deleted_at is null
                                          and x.author_id <> all (v_blocked)))),
         coalesce((select jsonb_object_agg(rc.kind, rc.n) from (
           select r.kind, count(*) as n from public.reactions r
             join public.profiles ra on ra.id = r.user_id
            where r.target_type = 'post' and r.target_id = p.id
              and ra.deletion_requested_at is null and r.user_id <> all (v_blocked)
            group by r.kind) rc), '{}'::jsonb),
         coalesce((select array_agg(r.kind order by r.kind) from public.reactions r
                    where r.target_type = 'post' and r.target_id = p.id and r.user_id = p_caller), '{}'),
         p.author_id is not distinct from p_caller
    from public.posts p
    left join public.profiles a on a.id = p.author_id
   where p.group_id = p_group and p.deleted_at is null
     and (p.author_id is null or (a.deletion_requested_at is null and a.deleted_at is null
                                  and p.author_id <> all (v_blocked)))
     and (p.kind <> 'milestone' or util.milestone_visible(p.group_id, p.author_id))
     and case
           when p_post is not null then p.id = p_post
           when p_kind = 'pinned' then p.pinned
           else not p.pinned and (p_kind is null or p.kind = p_kind)
                and (p_before is null or p.id < p_before)
         end
   order by p.id desc
   limit case when p_kind = 'pinned' or p_post is not null then 50 else p_limit end;
end;
$$;

-- ---------------------------------------------------------------- badges, erasure, export

-- As in 6a, plus nudges count as encouragement given.
create or replace function private.award_social_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_given bigint;
  v_prayed bigint;
begin
  if exists (select 1 from public.posts p where p.author_id = p_user and p.kind = 'testimony') then
    insert into public.user_badges (user_id, badge) values (p_user, 'first_testimony')
    on conflict (user_id, badge) do nothing;
  end if;

  select count(distinct p.id) into v_prayed
    from public.reactions r
    join public.posts p on p.id = r.target_id
   where r.user_id = p_user and r.target_type = 'post' and r.kind = 'pray'
     and p.kind = 'prayer_request' and p.author_id is distinct from p_user;
  if v_prayed >= util.config_int('badge_prayer_warrior_count') then
    insert into public.user_badges (user_id, badge) values (p_user, 'prayer_warrior')
    on conflict (user_id, badge) do nothing;
  end if;

  select
    (select count(*) from public.reactions r
       left join public.posts p on r.target_type = 'post' and p.id = r.target_id
       left join public.comments c on r.target_type = 'comment' and c.id = r.target_id
      where r.user_id = p_user and coalesce(p.author_id, c.author_id) is distinct from p_user)
    + (select count(*) from public.comments c
         join public.posts p on p.id = c.post_id
        where c.author_id = p_user and c.deleted_at is null and p.author_id is distinct from p_user)
    + (select count(*) from public.nudges n where n.from_user = p_user)
    into v_given;
  if v_given >= util.config_int('badge_encourager_count') then
    insert into public.user_badges (user_id, badge) values (p_user, 'encourager')
    on conflict (user_id, badge) do nothing;
  end if;
end;
$$;

-- As in 6a, plus nudges and partnerships.
create or replace function private.anonymise_group_contributions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_next uuid;
  v_groups uuid[];
begin
  for v_group in
    select g.id from public.groups g where g.owner_id = p_user_id order by g.id for update
  loop
    select m.user_id into v_next
      from public.group_members m
     where m.group_id = v_group and m.user_id <> p_user_id and m.status = 'active'
     order by util.account_open(m.user_id) desc, (m.role = 'admin') desc, m.joined_at, m.user_id
     limit 1;
    if v_next is null then
      perform private.delete_group_now(v_group, null, 'owner_account_erased');
    else
      update public.group_members set role = 'member' where group_id = v_group and user_id = p_user_id;
      update public.group_members set role = 'owner' where group_id = v_group and user_id = v_next;
      update public.groups set owner_id = v_next where id = v_group;
      update public.group_covenant_proposals set closed_at = now(), outcome = 'withdrawn'
       where group_id = v_group and closed_at is null;
      perform private.group_audit(null, 'group.ownership_transferred', v_group, v_next,
                                  '{"reason":"owner_account_erased"}');
    end if;
  end loop;

  delete from public.group_invites where created_by = p_user_id;
  delete from public.group_covenant_agreements where user_id = p_user_id;
  update public.group_covenant_proposals set proposed_by = null where proposed_by = p_user_id;

  with gone as (
    delete from public.group_members where user_id = p_user_id returning group_id
  )
  select array_agg(group_id) into v_groups from gone;

  if v_groups is not null then
    foreach v_group in array v_groups loop
      perform private.try_apply_covenant(v_group);
    end loop;
  end if;

  -- Phase 6a (D-077): posts and comments stay, as "A former member";
  -- reactions, blocks and the reports they made go. Reports about them keep
  -- the report but lose the link to the person.
  update public.posts set author_id = null where author_id = p_user_id;
  update public.comments set author_id = null where author_id = p_user_id;
  delete from public.reactions where user_id = p_user_id;
  delete from public.blocks where p_user_id in (blocker_id, blocked_id);
  delete from public.reports where reporter_id = p_user_id;
  update public.reports set subject_id = null where subject_id = p_user_id;
  -- Phase 6b (D-082, D-083): nudges and partnerships go.
  delete from public.nudges where p_user_id in (from_user, to_user);
  delete from public.partnerships where p_user_id in (user_a, user_b);
end;
$$;

-- As in 6a, plus nudges (received ones without the sender) and partnerships.
create or replace function public.my_social_export()
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
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'kind', p.kind, 'text', p.body, 'badge', p.badge, 'pinned', p.pinned,
               'created_at', p.created_at, 'edited_at', p.edited_at, 'deleted_at', p.deleted_at)
             order by p.created_at)
        from public.posts p left join public.groups g on g.id = p.group_id
       where p.author_id = v_uid), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'post', c.post_id, 'text', c.body,
               'created_at', c.created_at, 'edited_at', c.edited_at, 'deleted_at', c.deleted_at)
             order by c.created_at)
        from public.comments c left join public.groups g on g.id = c.group_id
       where c.author_id = v_uid), '[]'::jsonb),
    'reactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'on', r.target_type, 'item', r.target_id, 'reaction', r.kind,
               'created_at', r.created_at)
             order by r.created_at)
        from public.reactions r left join public.groups g on g.id = r.group_id
       where r.user_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('person', k.blocked_id, 'created_at', k.created_at) order by k.created_at)
        from public.blocks k where k.blocker_id = v_uid), '[]'::jsonb),
    'nudges_sent', coalesce((
      select jsonb_agg(jsonb_build_object('group', g.name, 'kind', n.kind, 'created_at', n.created_at)
             order by n.created_at)
        from public.nudges n left join public.groups g on g.id = n.group_id
       where n.from_user = v_uid), '[]'::jsonb),
    -- Received nudges: the kind and when, never who sent them (that's theirs).
    'nudges_received', coalesce((
      select jsonb_agg(jsonb_build_object('group', g.name, 'kind', n.kind, 'created_at', n.created_at)
             order by n.created_at)
        from public.nudges n left join public.groups g on g.id = n.group_id
       where n.to_user = v_uid), '[]'::jsonb),
    'partnerships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'partner', case when p.user_a = v_uid then p.user_b else p.user_a end,
               'asked_by_you', p.user_a = v_uid, 'status', p.status,
               'you_allow_alerts', case when p.user_a = v_uid then p.a_allows_alerts else p.b_allows_alerts end,
               'requested_at', p.requested_at, 'accepted_at', p.accepted_at, 'ended_at', p.ended_at)
             order by p.requested_at)
        from public.partnerships p left join public.groups g on g.id = p.group_id
       where v_uid in (p.user_a, p.user_b)), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'about', r.target_type, 'item', r.target_id, 'reason', r.reason, 'note', r.note,
               'status', r.status, 'created_at', r.created_at, 'resolved_at', r.resolved_at)
             order by r.created_at)
        from public.reports r left join public.groups g on g.id = r.group_id
       where r.reporter_id = v_uid), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.send_nudge(uuid, uuid, text)', 'public.group_nudge_targets(uuid)', 'public.my_nudges(uuid, integer)',
    'public.set_group_nudges_muted(uuid, boolean)', 'public.request_partner(uuid, uuid)',
    'public.respond_partner(uuid, boolean)', 'public.end_partnership(uuid)',
    'public.set_partner_alerts(uuid, boolean)', 'public.my_partnerships(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
