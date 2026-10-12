-- social: live updates on the group page, and reactions on check-ins
-- (CLAUDE.md §7.7, §7.8, §14). Phase 6c; see D-086 and D-087.
--
-- Live updates (owner, 2026-10-12: "the HMAC topic"). The browser never holds
-- a session token (session cookies are httpOnly, D-020), so Supabase
-- Realtime's private channels, which authorise with the user's token, can't
-- be used. Instead the database broadcasts content-free pings ("the wall
-- changed", "today changed") on a public channel whose name is an HMAC of the
-- group id and the day, with a key that never leaves the database. Only
-- members are given today's name; it changes every day. On a ping the page
-- asks the server again, so RLS, blocks and share levels decide what it shows:
-- nothing personal ever travels over the socket.
--
-- Reactions on check-ins: a member can react to another member's check-in in
-- the Today panel (pray, heart, fire, "with you", dove). Reacting reveals
-- nothing about the answer: every member can already see who checked in.

-- ---------------------------------------------------------------- the topic

create table private.realtime_keys (
  id integer primary key default 1 check (id = 1),
  secret bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now()
);

comment on table private.realtime_keys is
  'The key behind each group''s daily live-update channel name (D-086). Never leaves the database.';

insert into private.realtime_keys default values;

-- The channel name for a group on a (UTC) day.
create or replace function private.group_topic(p_group uuid, p_day date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'group:' || left(encode(extensions.hmac(convert_to(p_group::text || ':' || p_day::text, 'UTF8'),
                                                  (select k.secret from private.realtime_keys k where k.id = 1),
                                                  'sha256'), 'hex'), 40);
$$;

revoke all on function private.group_topic(uuid, date) from public;

-- Today's channel name, for an active member of the group only.
create or replace function public.group_live_topic(p_group uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.social_member(p_group, false);
  return private.group_topic(p_group, (now() at time zone 'utc')::date);
end;
$$;

revoke all on function public.group_live_topic(uuid) from public, anon;
grant execute on function public.group_live_topic(uuid) to authenticated;

-- One ping: what changed, nothing else. A failed ping never fails the write
-- that caused it (realtime.send only warns).
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
                        private.group_topic(p_group, (now() at time zone 'utc')::date), false);
end;
$$;

revoke all on function private.ping_group(uuid, text) from public;

create or replace function private.ping_on_wall()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ping_group(coalesce(new.group_id, old.group_id), 'wall');
  return null;
end;
$$;

create or replace function private.ping_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ping_group(coalesce(new.group_id, old.group_id),
                             case when coalesce(new.target_type, old.target_type) = 'checkin' then 'today' else 'wall' end);
  return null;
end;
$$;

-- A check-in (or a changed answer) changes Today in every group the person is in.
create or replace function private.ping_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  for v_group in
    select m.group_id from public.group_members m where m.user_id = new.user_id and m.status = 'active'
  loop
    perform private.ping_group(v_group, 'today');
  end loop;
  return null;
end;
$$;

create or replace function private.ping_on_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ping_group(coalesce(new.group_id, old.group_id), 'today');
  return null;
end;
$$;

create trigger posts_ping after insert or update or delete on public.posts
  for each row execute function private.ping_on_wall();
create trigger comments_ping after insert or update or delete on public.comments
  for each row execute function private.ping_on_wall();
create trigger reactions_ping after insert or delete on public.reactions
  for each row execute function private.ping_on_reaction();
create trigger checkins_ping after insert or update of outcome on public.checkins
  for each row execute function private.ping_on_checkin();
create trigger group_members_ping after insert or update of status or delete on public.group_members
  for each row execute function private.ping_on_membership();

revoke all on function private.ping_on_wall() from public;
revoke all on function private.ping_on_reaction() from public;
revoke all on function private.ping_on_checkin() from public;
revoke all on function private.ping_on_membership() from public;

-- ---------------------------------------------------------------- reactions on check-ins

-- The check-in's id joins the Today view (only when there is one today), so
-- members can react to it. It says nothing beyond "checked in today".
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
  case when v.rank >= 1 then util.member_level(m.user_id) end as level,
  c.id as checkin_id
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

-- React to (or take back a reaction on) another member's check-in, in a
-- group you share. +1 encouragement XP once per check-in.
create or replace function public.react_to_checkin(p_group uuid, p_checkin uuid, p_kind text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_owner uuid;
  v_rows integer;
begin
  select * into c from private.social_member(p_group, true);
  if p_kind is null or p_kind not in ('pray', 'heart', 'fire', 'strong', 'dove') or p_on is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select k.user_id into v_owner from public.checkins k where k.id = p_checkin;
  if v_owner is null or v_owner = c.caller_id
     or not exists (select 1 from public.group_members m
                     where m.group_id = p_group and m.user_id = v_owner and m.status = 'active')
     or not util.account_open(v_owner) or util.blocked_between(c.caller_id, v_owner) then
    raise exception 'checkin_not_found' using errcode = '42501';
  end if;
  perform private.throttle(c.caller_id, 'reaction', 250, interval '1 hour');
  if p_on then
    insert into public.reactions (group_id, user_id, target_type, target_id, kind)
    values (p_group, c.caller_id, 'checkin', p_checkin, p_kind)
    on conflict (user_id, target_type, target_id, kind) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      perform private.queue_encouragement(c.caller_id, p_group, 'reaction:' || c.caller_id || ':checkin:' || p_checkin);
    end if;
  else
    delete from public.reactions
     where user_id = c.caller_id and target_type = 'checkin' and target_id = p_checkin and kind = p_kind
       and group_id = p_group;
  end if;
end;
$$;

-- Reactions on today's check-ins in a group, per check-in: counts (leaving
-- out people blocked either way and closing accounts) and mine.
create or replace function public.group_checkin_reactions(p_group uuid)
returns table (checkin_id uuid, reactions jsonb, my_reactions text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  v_blocked uuid[];
begin
  select * into c from private.social_member(p_group, false);
  v_blocked := util.block_set(c.caller_id);
  return query
  select t.checkin_id,
         coalesce((select jsonb_object_agg(rc.kind, rc.n) from (
           select r.kind, count(*) as n from public.reactions r
             join public.profiles ra on ra.id = r.user_id
            where r.target_type = 'checkin' and r.target_id = t.checkin_id and r.group_id = p_group
              and ra.deletion_requested_at is null and r.user_id <> all (v_blocked)
            group by r.kind) rc), '{}'::jsonb),
         coalesce((select array_agg(r.kind order by r.kind) from public.reactions r
                    where r.target_type = 'checkin' and r.target_id = t.checkin_id and r.group_id = p_group
                      and r.user_id = c.caller_id), '{}')
    from public.group_checkins_today t
   where t.group_id = p_group and t.checkin_id is not null;
end;
$$;

revoke all on function public.react_to_checkin(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.group_checkin_reactions(uuid) from public, anon;
grant execute on function public.react_to_checkin(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.group_checkin_reactions(uuid) to authenticated;

-- Erasing an account also removes reactions on its check-ins (the check-ins
-- themselves go with the account).
create or replace function private.reactions_on_checkin_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.reactions where target_type = 'checkin' and target_id = old.id;
  return null;
end;
$$;

create trigger checkins_delete_reactions after delete on public.checkins
  for each row execute function private.reactions_on_checkin_deleted();

revoke all on function private.reactions_on_checkin_deleted() from public;
