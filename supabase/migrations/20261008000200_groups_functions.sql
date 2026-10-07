-- groups: every write to the group tables (CLAUDE.md §7.4). See D-034.
--
-- Each function:
--   1. refuses a caller without a live, verified session (util.session_ok);
--   2. locks the group row and reads the caller's own role in THAT group, so
--      an admin of group A has no rights at all in group B (the caller gets
--      "group_not_found", the same answer as for a group that doesn't exist);
--   3. makes the change and writes the audit row in the same transaction.
--
-- Errors are raised with a short key as the message ('group_full', ...) that
-- the app turns into friendly copy. Authorisation failures use SQLSTATE 42501.
-- Audit rows hold ids and role or share-level values only, never names or
-- covenant text (D-016). When an action concerns another member, that member
-- is the target, so erasing their account unlinks the row (D-033).

-- ---------------------------------------------------------------- helpers

create or replace function util.share_rank(p_level text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_level when 'checkin_only' then 0 when 'streak' then 1 when 'full' then 2 end;
$$;

grant execute on function util.share_rank(text) to authenticated, service_role;

-- The signed-in caller, or an authorisation error.
create or replace function private.caller()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not util.session_ok() then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Locks a group and checks the caller's role in it.
-- p_need: 'member' (any active member), 'admin' (owner or admin) or 'owner'.
create or replace function private.lock_group(
  p_group uuid,
  p_need text,
  out my_role text,
  out caller_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  caller_id := private.caller();
  perform 1 from public.groups g where g.id = p_group for update;
  select m.role into my_role from public.group_members m
   where m.group_id = p_group and m.user_id = caller_id and m.status = 'active';
  if my_role is null then
    raise exception 'group_not_found' using errcode = '42501';
  end if;
  if (p_need = 'owner' and my_role <> 'owner')
     or (p_need = 'admin' and my_role not in ('owner', 'admin')) then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.group_audit(
  p_actor uuid,
  p_action text,
  p_group uuid,
  p_subject uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  select util.audit(
    p_actor,
    p_action,
    case when p_subject is null then 'group' else 'user' end,
    coalesce(p_subject, p_group),
    case when p_subject is null then coalesce(p_metadata, '{}'::jsonb)
         else coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('group', p_group) end
  );
$$;

-- Checks shared by creating and joining a group.
create or replace function private.check_can_join_groups(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null) then
    raise exception 'email_unverified';
  end if;
  if not util.account_open(p_user) then
    raise exception 'account_closing';
  end if;
  -- A generous ceiling against abuse; people normally belong to a few.
  if (select count(*) from public.group_members m
       where m.user_id = p_user and m.status in ('active', 'pending')) >= 30 then
    raise exception 'too_many_groups';
  end if;
end;
$$;

create or replace function private.check_challenge(
  p_type text, p_days integer, p_start date, p_timezone text,
  out challenge_days integer, out end_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then
    raise exception 'timezone_invalid';
  end if;
  if p_type not in ('30', '40', '60', '90', 'custom', 'ongoing') then
    raise exception 'invalid_input';
  end if;
  v_today := (now() at time zone p_timezone)::date;
  -- Up to a month back (a group catching up on a challenge already begun)
  -- and up to a year ahead.
  if p_start is null or p_start < v_today - 30 or p_start > v_today + 365 then
    raise exception 'start_date_out_of_range';
  end if;
  if p_type = 'ongoing' then
    challenge_days := null;
    end_date := null;
  elsif p_type = 'custom' then
    if p_days is null or p_days not between 7 and 365 then
      raise exception 'invalid_input';
    end if;
    challenge_days := p_days;
    end_date := p_start + (p_days - 1);
  else
    challenge_days := p_type::integer;
    end_date := p_start + (challenge_days - 1);
  end if;
end;
$$;

create or replace function private.make_group_slug(p_name text)
returns text
language sql
volatile
set search_path = ''
as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), 40), ''), 'group')
         || '-' || encode(extensions.gen_random_bytes(5), 'hex');
$$;

revoke all on function private.caller() from public;
revoke all on function private.lock_group(uuid, text) from public;
revoke all on function private.group_audit(uuid, text, uuid, uuid, jsonb) from public;
revoke all on function private.check_can_join_groups(uuid) from public;
revoke all on function private.check_challenge(text, integer, date, text) from public;
revoke all on function private.make_group_slug(text) from public;

-- ---------------------------------------------------------------- create

create or replace function public.create_group(
  p_name text,
  p_description text,
  p_challenge_type text,
  p_challenge_days integer,
  p_start_date date,
  p_timezone text,
  p_max_members integer,
  p_join_policy text,
  p_covenant_text text,
  p_min_share_level text,
  p_leaderboard_hiding_allowed boolean,
  p_my_share_level text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  v_id uuid := util.uuid_v7();
  c record;
begin
  perform private.check_can_join_groups(v_uid);
  if (select count(*) from public.groups g where g.owner_id = v_uid and g.archived_at is null) >= 10 then
    raise exception 'too_many_groups';
  end if;
  select * into c from private.check_challenge(p_challenge_type, p_challenge_days, p_start_date, p_timezone);
  if util.share_rank(p_my_share_level) is null or util.share_rank(p_min_share_level) is null then
    raise exception 'invalid_input';
  end if;

  insert into public.groups (
    id, name, slug, description, owner_id, challenge_type, challenge_days, start_date, end_date,
    group_timezone, covenant_text, min_share_level, leaderboard_hiding_allowed, join_policy, max_members
  ) values (
    v_id, btrim(p_name), private.make_group_slug(p_name), nullif(btrim(coalesce(p_description, '')), ''),
    v_uid, p_challenge_type, c.challenge_days, p_start_date, c.end_date,
    p_timezone, btrim(p_covenant_text), p_min_share_level, coalesce(p_leaderboard_hiding_allowed, true),
    coalesce(p_join_policy, 'invite_only'), coalesce(p_max_members, 50)
  );

  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (v_id, v_uid, 'owner', 'active', p_my_share_level, now(), now());

  perform private.group_audit(v_uid, 'group.created', v_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- settings

-- Name and description: owners and admins.
create or replace function public.update_group_details(p_group uuid, p_name text, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'admin');
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then raise exception 'group_archived'; end if;
  update public.groups
     set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), '')
   where id = p_group;
  perform private.group_audit(l.caller_id, 'group.updated', p_group, null, '{"part":"details"}');
end;
$$;

-- Challenge settings: the owner only (§3).
create or replace function public.update_group_challenge(
  p_group uuid,
  p_challenge_type text,
  p_challenge_days integer,
  p_start_date date,
  p_timezone text,
  p_max_members integer,
  p_join_policy text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
  c record;
begin
  select * into l from private.lock_group(p_group, 'owner');
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then raise exception 'group_archived'; end if;
  -- An unchanged start date may lie further back than a new group's could.
  if p_start_date = g.start_date and p_timezone = g.group_timezone then
    select * into c from private.check_challenge(p_challenge_type, p_challenge_days,
      greatest(p_start_date, (now() at time zone p_timezone)::date - 30), p_timezone);
    c.end_date := case when c.challenge_days is null then null else p_start_date + (c.challenge_days - 1) end;
  else
    select * into c from private.check_challenge(p_challenge_type, p_challenge_days, p_start_date, p_timezone);
  end if;
  if p_max_members is null or p_max_members < greatest(g.member_count, 2) or p_max_members > 500 then
    raise exception 'max_members_too_low';
  end if;
  update public.groups
     set challenge_type = p_challenge_type, challenge_days = c.challenge_days, start_date = p_start_date,
         end_date = c.end_date, group_timezone = p_timezone, max_members = p_max_members,
         join_policy = p_join_policy
   where id = p_group;
  perform private.group_audit(l.caller_id, 'group.updated', p_group, null, '{"part":"challenge"}');
end;
$$;

-- ---------------------------------------------------------------- covenant

create or replace function private.apply_covenant(
  p_group uuid, p_text text, p_min text, p_hiding boolean, p_actor uuid, p_via text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
  v_pending uuid;
begin
  select * into g from public.groups where id = p_group;
  -- Members already agreed (or the change only relaxes things): bring
  -- everyone up to the new minimum, and back onto the leaderboard if hiding
  -- is no longer allowed. Done before the group row changes, so each step
  -- passes the per-member check.
  update public.group_members
     set share_level = p_min
   where group_id = p_group and util.share_rank(share_level) < util.share_rank(p_min);
  if not p_hiding then
    update public.group_members set leaderboard_hidden = false where group_id = p_group and leaderboard_hidden;
  end if;
  -- Requests made under the old covenant didn't agree to the tighter one.
  if util.share_rank(p_min) > util.share_rank(g.min_share_level)
     or (g.leaderboard_hiding_allowed and not p_hiding)
     or p_text is distinct from g.covenant_text then
    for v_pending in
      delete from public.group_members where group_id = p_group and status = 'pending' returning user_id
    loop
      perform private.group_audit(p_actor, 'group.join_declined', p_group, v_pending, '{"reason":"covenant_changed"}');
    end loop;
  end if;
  update public.groups
     set covenant_text = p_text, min_share_level = p_min, leaderboard_hiding_allowed = p_hiding,
         covenant_updated_at = now()
   where id = p_group;
  perform private.group_audit(p_actor, 'group.covenant_changed', p_group, null, jsonb_build_object(
    'via', p_via, 'min_share_level', p_min, 'leaderboard_hiding_allowed', p_hiding));
end;
$$;

-- Applies the open proposal once every other active member has agreed.
-- Called after an agreement and whenever someone leaves or is removed.
create or replace function private.try_apply_covenant(p_group uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.group_covenant_proposals;
begin
  select * into p from public.group_covenant_proposals
   where group_id = p_group and closed_at is null
   for update;
  if p.id is null then return false; end if;
  if p.expires_at <= now() then
    update public.group_covenant_proposals set closed_at = now(), outcome = 'expired' where id = p.id;
    return false;
  end if;
  if exists (
    select 1 from public.group_members m
     where m.group_id = p_group and m.status = 'active' and m.role <> 'owner' and util.account_open(m.user_id)
       and not exists (select 1 from public.group_covenant_agreements a
                        where a.proposal_id = p.id and a.user_id = m.user_id)
  ) then
    return false;
  end if;
  perform private.apply_covenant(p_group, p.covenant_text, p.min_share_level, p.leaderboard_hiding_allowed,
                                 p.proposed_by, 'agreement');
  update public.group_covenant_proposals set closed_at = now(), outcome = 'applied' where id = p.id;
  return true;
end;
$$;

revoke all on function private.apply_covenant(uuid, text, text, boolean, uuid, text) from public;
revoke all on function private.try_apply_covenant(uuid) from public;

-- The owner changes the covenant. Returns 'applied' when it took effect at
-- once (it only relaxes things, or nobody else has joined yet), 'proposed'
-- when every other member must agree first, or 'unchanged'.
create or replace function public.change_group_covenant(
  p_group uuid, p_covenant_text text, p_min_share_level text, p_leaderboard_hiding_allowed boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
  v_text text := btrim(p_covenant_text);
  v_tighter boolean;
  v_others integer;
begin
  select * into l from private.lock_group(p_group, 'owner');
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then raise exception 'group_archived'; end if;
  if util.share_rank(p_min_share_level) is null or p_leaderboard_hiding_allowed is null
     or char_length(coalesce(v_text, '')) not between 10 and 2000 then
    raise exception 'invalid_input';
  end if;
  if v_text = g.covenant_text and p_min_share_level = g.min_share_level
     and p_leaderboard_hiding_allowed = g.leaderboard_hiding_allowed then
    return 'unchanged';
  end if;

  v_tighter := util.share_rank(p_min_share_level) > util.share_rank(g.min_share_level)
            or (g.leaderboard_hiding_allowed and not p_leaderboard_hiding_allowed)
            or v_text <> g.covenant_text;
  select count(*) into v_others from public.group_members m
   where m.group_id = p_group and m.status = 'active' and m.role <> 'owner';

  -- Any earlier proposal is replaced by this one (or by applying it).
  update public.group_covenant_proposals set closed_at = now(), outcome = 'withdrawn'
   where group_id = p_group and closed_at is null;

  if not v_tighter or v_others = 0 then
    perform private.apply_covenant(p_group, v_text, p_min_share_level, p_leaderboard_hiding_allowed,
                                   l.caller_id, 'owner');
    return 'applied';
  end if;

  insert into public.group_covenant_proposals (group_id, proposed_by, covenant_text, min_share_level,
                                               leaderboard_hiding_allowed)
  values (p_group, l.caller_id, v_text, p_min_share_level, p_leaderboard_hiding_allowed);
  perform private.group_audit(l.caller_id, 'group.covenant_proposed', p_group, null, jsonb_build_object(
    'min_share_level', p_min_share_level, 'leaderboard_hiding_allowed', p_leaderboard_hiding_allowed));
  return 'proposed';
end;
$$;

-- A member agrees to the open proposal. Returns true when that was the last
-- agreement needed and the new covenant now applies.
create or replace function public.agree_to_covenant_change(p_proposal uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  l record;
  g public.groups;
begin
  select group_id into v_group from public.group_covenant_proposals where id = p_proposal;
  select * into l from private.lock_group(v_group, 'member');
  select * into g from public.groups where id = v_group;
  if not exists (select 1 from public.group_covenant_proposals
                  where id = p_proposal and closed_at is null and expires_at > now()) then
    raise exception 'proposal_closed';
  end if;
  if l.my_role = 'owner' then raise exception 'group_forbidden' using errcode = '42501'; end if;
  insert into public.group_covenant_agreements (proposal_id, group_id, user_id)
  values (p_proposal, v_group, l.caller_id)
  on conflict do nothing;
  perform private.group_audit(l.caller_id, 'group.covenant_agreed', v_group);
  return private.try_apply_covenant(v_group);
end;
$$;

-- Any member may decline; the covenant then stays as everyone agreed it.
create or replace function public.decline_covenant_change(p_proposal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  l record;
  g public.groups;
begin
  select group_id into v_group from public.group_covenant_proposals where id = p_proposal;
  select * into l from private.lock_group(v_group, 'member');
  select * into g from public.groups where id = v_group;
  if l.my_role = 'owner' then raise exception 'group_forbidden' using errcode = '42501'; end if;
  update public.group_covenant_proposals set closed_at = now(), outcome = 'declined'
   where id = p_proposal and closed_at is null;
  if not found then raise exception 'proposal_closed'; end if;
  perform private.group_audit(l.caller_id, 'group.covenant_declined', v_group);
end;
$$;

create or replace function public.withdraw_covenant_change(p_proposal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  l record;
  g public.groups;
begin
  select group_id into v_group from public.group_covenant_proposals where id = p_proposal;
  select * into l from private.lock_group(v_group, 'owner');
  select * into g from public.groups where id = v_group;
  update public.group_covenant_proposals set closed_at = now(), outcome = 'withdrawn'
   where id = p_proposal and closed_at is null;
  if not found then raise exception 'proposal_closed'; end if;
  perform private.group_audit(l.caller_id, 'group.covenant_withdrawn', v_group);
end;
$$;

-- ---------------------------------------------------------------- lifecycle

create or replace function public.archive_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'owner');
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then return; end if;
  update public.groups set archived_at = now() where id = p_group;
  update public.group_covenant_proposals set closed_at = now(), outcome = 'withdrawn'
   where group_id = p_group and closed_at is null;
  perform private.group_audit(l.caller_id, 'group.archived', p_group);
end;
$$;

create or replace function public.unarchive_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'owner');
  select * into g from public.groups where id = p_group;
  if g.archived_at is null then return; end if;
  update public.groups set archived_at = null where id = p_group;
  perform private.group_audit(l.caller_id, 'group.unarchived', p_group);
end;
$$;

-- Deletes the group and everything in it. The owner types the group's name
-- to confirm. The picture files are queued for removal through the Storage
-- API (D-033), like an erased account's.
create or replace function public.delete_group(p_group uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'owner');
  select * into g from public.groups where id = p_group;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(g.name) then
    raise exception 'name_mismatch';
  end if;
  perform private.delete_group_now(p_group, l.caller_id, 'owner');
end;
$$;

create or replace function private.delete_group_now(p_group uuid, p_actor uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.storage_purge_queue (bucket, prefix)
  values ('group-pictures', p_group::text)
  on conflict (bucket, prefix) do nothing;
  delete from public.groups where id = p_group;
  perform private.group_audit(p_actor, 'group.deleted', p_group, null, jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function private.delete_group_now(uuid, uuid, text) from public;

-- Makes another active member the owner; the old owner becomes an admin.
create or replace function public.transfer_group_ownership(p_group uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'owner');
  select * into g from public.groups where id = p_group;
  if p_new_owner = l.caller_id then raise exception 'cannot_target_self'; end if;
  if not exists (select 1 from public.group_members m
                  where m.group_id = p_group and m.user_id = p_new_owner and m.status = 'active')
     or not util.account_open(p_new_owner) then
    raise exception 'target_not_member';
  end if;
  update public.group_members set role = 'admin' where group_id = p_group and user_id = l.caller_id;
  update public.group_members set role = 'owner' where group_id = p_group and user_id = p_new_owner;
  update public.groups set owner_id = p_new_owner where id = p_group;
  -- A proposal belongs to the owner who made it.
  update public.group_covenant_proposals set closed_at = now(), outcome = 'withdrawn'
   where group_id = p_group and closed_at is null;
  perform private.group_audit(l.caller_id, 'group.ownership_transferred', p_group, p_new_owner);
end;
$$;

-- ---------------------------------------------------------------- members

-- Promote to admin or demote to member: the owner only.
create or replace function public.set_group_member_role(p_group uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
  v_old text;
begin
  select * into l from private.lock_group(p_group, 'owner');
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then raise exception 'group_archived'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid_input'; end if;
  if p_user = l.caller_id then raise exception 'cannot_target_self'; end if;
  select role into v_old from public.group_members
   where group_id = p_group and user_id = p_user and status = 'active' for update;
  if v_old is null then raise exception 'target_not_member'; end if;
  if v_old = p_role then return; end if;
  update public.group_members set role = p_role where group_id = p_group and user_id = p_user;
  perform private.group_audit(l.caller_id, 'group.role_changed', p_group, p_user,
                              jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

-- The owner removes anyone else; an admin removes members (not admins).
create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
  v_role text;
begin
  select * into l from private.lock_group(p_group, 'admin');
  select * into g from public.groups where id = p_group;
  if p_user = l.caller_id then raise exception 'cannot_target_self'; end if;
  select role into v_role from public.group_members
   where group_id = p_group and user_id = p_user and status = 'active' for update;
  if v_role is null then raise exception 'target_not_member'; end if;
  if v_role = 'owner' or (v_role = 'admin' and l.my_role <> 'owner') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  update public.group_members
     set status = 'removed', role = 'member', leaderboard_hidden = false
   where group_id = p_group and user_id = p_user;
  delete from public.group_covenant_agreements a
   using public.group_covenant_proposals p
   where a.proposal_id = p.id and p.group_id = p_group and a.user_id = p_user;
  perform private.group_audit(l.caller_id, 'group.member_removed', p_group, p_user);
  perform private.try_apply_covenant(p_group);
end;
$$;

-- Lifts a removal, so that person may join again with an invite.
create or replace function public.allow_group_member_back(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'admin');
  select * into g from public.groups where id = p_group;
  delete from public.group_members where group_id = p_group and user_id = p_user and status = 'removed';
  if not found then raise exception 'target_not_member'; end if;
  perform private.group_audit(l.caller_id, 'group.member_readmitted', p_group, p_user);
end;
$$;

create or replace function public.approve_join_request(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'admin');
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then raise exception 'group_archived'; end if;
  if not exists (select 1 from public.group_members
                  where group_id = p_group and user_id = p_user and status = 'pending' for update)
     or not util.account_open(p_user) then
    raise exception 'target_not_member';
  end if;
  if g.member_count >= g.max_members then raise exception 'group_full'; end if;
  update public.group_members set status = 'active', joined_at = now()
   where group_id = p_group and user_id = p_user;
  perform private.group_audit(l.caller_id, 'group.join_approved', p_group, p_user);
end;
$$;

create or replace function public.decline_join_request(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'admin');
  select * into g from public.groups where id = p_group;
  delete from public.group_members where group_id = p_group and user_id = p_user and status = 'pending';
  if not found then raise exception 'target_not_member'; end if;
  perform private.group_audit(l.caller_id, 'group.join_declined', p_group, p_user);
end;
$$;

-- Leave a group, or withdraw a request to join. The owner hands the group
-- to someone else first (or archives or deletes it). The row is deleted:
-- nothing is kept about a past membership (D-038).
create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  m public.group_members;
begin
  perform 1 from public.groups where id = p_group for update;
  select * into m from public.group_members where group_id = p_group and user_id = v_uid;
  if m.user_id is null or m.status = 'removed' then
    raise exception 'group_not_found' using errcode = '42501';
  end if;
  if m.role = 'owner' then raise exception 'owner_must_transfer'; end if;
  delete from public.group_covenant_agreements where group_id = p_group and user_id = v_uid;
  delete from public.group_members where group_id = p_group and user_id = v_uid;
  perform private.group_audit(v_uid, case when m.status = 'pending' then 'group.join_withdrawn'
                                          else 'group.member_left' end, p_group);
  perform private.try_apply_covenant(p_group);
end;
$$;

-- My own share level and leaderboard choice in one group: at least the
-- covenant's minimum, never less (D-027).
create or replace function public.update_my_group_membership(
  p_group uuid, p_share_level text, p_leaderboard_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'member');
  select * into g from public.groups where id = p_group;
  if util.share_rank(p_share_level) is null then raise exception 'invalid_input'; end if;
  if util.share_rank(p_share_level) < util.share_rank(g.min_share_level) then
    raise exception 'share_level_too_low';
  end if;
  if coalesce(p_leaderboard_hidden, false) and not g.leaderboard_hiding_allowed then
    raise exception 'hiding_not_allowed';
  end if;
  update public.group_members
     set share_level = p_share_level, leaderboard_hidden = coalesce(p_leaderboard_hidden, false)
   where group_id = p_group and user_id = l.caller_id;
  perform private.group_audit(l.caller_id, 'group.membership_updated', p_group, null, jsonb_build_object(
    'share_level', p_share_level, 'leaderboard_hidden', coalesce(p_leaderboard_hidden, false)));
end;
$$;

-- ---------------------------------------------------------------- group picture

-- The server stores a new, processed picture under the group's folder, then
-- calls this as the person (owners and admins only). Screening publishes it.
-- Returns the previous pending path, whose files the server removes.
create or replace function public.set_group_picture_pending(p_group uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'admin');
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then raise exception 'group_archived'; end if;
  update public.groups set cover_pending_path = p_path, cover_status = 'pending_review' where id = p_group;
  perform private.group_audit(l.caller_id, 'group.picture_uploaded', p_group);
  return g.cover_pending_path;
end;
$$;

-- Removes the picture (live and pending). Returns the paths to delete.
create or replace function public.remove_group_picture(p_group uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
begin
  select * into l from private.lock_group(p_group, 'admin');
  select * into g from public.groups where id = p_group;
  update public.groups set cover_path = null, cover_pending_path = null, cover_status = 'none' where id = p_group;
  perform private.group_audit(l.caller_id, 'group.picture_removed', p_group);
  return array_remove(array[g.cover_path, g.cover_pending_path], null);
end;
$$;

-- ---------------------------------------------------------------- grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_group(text, text, text, integer, date, text, integer, text, text, text, boolean, text)',
    'public.update_group_details(uuid, text, text)',
    'public.update_group_challenge(uuid, text, integer, date, text, integer, text)',
    'public.change_group_covenant(uuid, text, text, boolean)',
    'public.agree_to_covenant_change(uuid)',
    'public.decline_covenant_change(uuid)',
    'public.withdraw_covenant_change(uuid)',
    'public.archive_group(uuid)',
    'public.unarchive_group(uuid)',
    'public.delete_group(uuid, text)',
    'public.transfer_group_ownership(uuid, uuid)',
    'public.set_group_member_role(uuid, uuid, text)',
    'public.remove_group_member(uuid, uuid)',
    'public.allow_group_member_back(uuid, uuid)',
    'public.approve_join_request(uuid, uuid)',
    'public.decline_join_request(uuid, uuid)',
    'public.leave_group(uuid)',
    'public.update_my_group_membership(uuid, text, boolean)',
    'public.set_group_picture_pending(uuid, text)',
    'public.remove_group_picture(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
