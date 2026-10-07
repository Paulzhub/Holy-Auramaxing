-- groups: invites by link, short code and QR code (CLAUDE.md §7.4). D-037.
--
-- The app makes the secrets and sends only their hashes here:
--   * link/QR token: 160 random bits; stored as SHA-256;
--   * short code: 10 Crockford base32 characters (50 bits); stored as an
--     HMAC keyed with a server-only secret, so a copy of the database alone
--     can't be used to try codes. The app rate-limits code attempts.
-- Looking an invite up takes one of the two hashes.

create or replace function private.find_invite(p_token_hash text, p_code_hash text)
returns public.group_invites
language sql
stable
security definer
set search_path = ''
as $$
  select i.* from public.group_invites i
   where (p_token_hash is not null and i.token_hash = p_token_hash)
      or (p_code_hash is not null and i.code_hash = p_code_hash)
   limit 1;
$$;

-- 'valid', or why the invite can't be used.
create or replace function private.invite_status(i public.group_invites, g public.groups)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when i.id is null or g.id is null then 'invalid'
    when i.revoked_at is not null then 'revoked'
    when i.expires_at <= now() then 'expired'
    when i.max_uses is not null and i.use_count >= i.max_uses then 'used_up'
    when g.archived_at is not null then 'archived'
    when g.member_count >= g.max_members then 'full'
    else 'valid'
  end;
$$;

revoke all on function private.find_invite(text, text) from public;
revoke all on function private.invite_status(public.group_invites, public.groups) from public;

-- ---------------------------------------------------------------- admins

create or replace function public.create_group_invite(
  p_group uuid, p_token_hash text, p_code_hash text, p_expires_in_days integer, p_max_uses integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  g public.groups;
  v_id uuid;
begin
  select * into l from private.lock_group(p_group, 'admin');
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then raise exception 'group_archived'; end if;
  if p_expires_in_days is null or p_expires_in_days not between 1 and 30
     or (p_max_uses is not null and p_max_uses not between 1 and 500) then
    raise exception 'invalid_input';
  end if;
  if (select count(*) from public.group_invites i
       where i.group_id = p_group and i.revoked_at is null and i.expires_at > now()) >= 20 then
    raise exception 'too_many_invites';
  end if;
  insert into public.group_invites (group_id, token_hash, code_hash, created_by, expires_at, max_uses)
  values (p_group, p_token_hash, p_code_hash, l.caller_id, now() + make_interval(days => p_expires_in_days), p_max_uses)
  returning id into v_id;
  perform private.group_audit(l.caller_id, 'group.invite_created', p_group, null, jsonb_build_object(
    'invite', v_id, 'days', p_expires_in_days, 'max_uses', p_max_uses));
  return v_id;
end;
$$;

create or replace function public.revoke_group_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  l record;
begin
  select group_id into v_group from public.group_invites where id = p_invite;
  select * into l from private.lock_group(v_group, 'admin');
  update public.group_invites set revoked_at = now() where id = p_invite and revoked_at is null;
  perform private.group_audit(l.caller_id, 'group.invite_revoked', v_group, null, jsonb_build_object('invite', p_invite));
end;
$$;

-- ---------------------------------------------------------------- invitees

-- What anyone holding a link may see: the group's name and member count,
-- and whether the invite still works (§7.4). Callable signed out.
create or replace function public.preview_group_invite(p_token_hash text, p_code_hash text default null)
returns table (status text, group_name text, member_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.group_invites;
  g public.groups;
  v_status text;
begin
  i := private.find_invite(p_token_hash, p_code_hash);
  select * into g from public.groups where id = i.group_id;
  v_status := private.invite_status(i, g);
  if v_status = 'invalid' then
    return query select v_status, null::text, null::integer;
  else
    return query select v_status, g.name, g.member_count;
  end if;
end;
$$;

-- What a signed-in person needs before joining: the covenant and the
-- group's accountability level (D-027), the challenge, and where they stand.
create or replace function public.group_invite_details(p_token_hash text, p_code_hash text default null)
returns table (
  status text,
  group_id uuid,
  group_name text,
  description text,
  member_count integer,
  challenge_type text,
  challenge_days integer,
  start_date date,
  end_date date,
  group_timezone text,
  covenant_text text,
  covenant_updated_at timestamptz,
  min_share_level text,
  leaderboard_hiding_allowed boolean,
  join_policy text,
  my_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.caller();
  i public.group_invites;
  g public.groups;
  v_status text;
  v_mine text;
begin
  i := private.find_invite(p_token_hash, p_code_hash);
  select * into g from public.groups where id = i.group_id;
  v_status := private.invite_status(i, g);
  if v_status = 'invalid' then
    return query select v_status, null::uuid, null::text, null::text, null::integer, null::text, null::integer,
                        null::date, null::date, null::text, null::text, null::timestamptz, null::text,
                        null::boolean, null::text, null::text;
    return;
  end if;
  select m.status into v_mine from public.group_members m where m.group_id = g.id and m.user_id = v_uid;
  if v_status <> 'valid' or v_mine is not null then
    -- Nothing more than the name, unless they can actually join.
    return query select v_status, case when v_mine in ('active', 'pending') then g.id end, g.name, null::text,
                        g.member_count, null::text, null::integer, null::date, null::date, null::text, null::text,
                        null::timestamptz, null::text, null::boolean, null::text, v_mine;
    return;
  end if;
  return query select v_status, g.id, g.name, g.description, g.member_count, g.challenge_type, g.challenge_days,
                      g.start_date, g.end_date, g.group_timezone, g.covenant_text, g.covenant_updated_at,
                      g.min_share_level, g.leaderboard_hiding_allowed, g.join_policy, v_mine;
end;
$$;

-- Joins with an invite. Returns 'active', or 'pending' when the group's
-- admins approve new members. p_covenant_seen is the covenant version the
-- person read; if it changed meanwhile they are asked to read it again.
create or replace function public.join_group(
  p_token_hash text,
  p_code_hash text,
  p_share_level text,
  p_leaderboard_hidden boolean,
  p_accept_covenant boolean,
  p_covenant_seen timestamptz
)
returns table (status text, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.caller();
  i public.group_invites;
  g public.groups;
  v_status text;
  v_mine text;
  v_new text;
begin
  i := private.find_invite(p_token_hash, p_code_hash);
  if i.id is null then raise exception 'invite_invalid'; end if;
  -- Lock the group, then the invite, so the last use can't be taken twice.
  select * into g from public.groups where id = i.group_id for update;
  select * into i from public.group_invites where id = i.id for update;

  select m.status into v_mine from public.group_members m where m.group_id = g.id and m.user_id = v_uid;
  if v_mine = 'active' then raise exception 'group_already_member'; end if;
  if v_mine = 'pending' then raise exception 'group_already_requested'; end if;
  if v_mine = 'removed' then raise exception 'group_removed'; end if;

  v_status := private.invite_status(i, g);
  if v_status <> 'valid' then
    raise exception '%', case v_status when 'full' then 'group_full' when 'archived' then 'group_archived'
                              else 'invite_' || v_status end;
  end if;

  perform private.check_can_join_groups(v_uid);
  if not coalesce(p_accept_covenant, false) then raise exception 'covenant_not_accepted'; end if;
  if p_covenant_seen is null or date_trunc('milliseconds', g.covenant_updated_at) > date_trunc('milliseconds', p_covenant_seen) then
    raise exception 'covenant_changed';
  end if;
  if util.share_rank(p_share_level) is null then raise exception 'invalid_input'; end if;
  if util.share_rank(p_share_level) < util.share_rank(g.min_share_level) then
    raise exception 'share_level_too_low';
  end if;
  if coalesce(p_leaderboard_hidden, false) and not g.leaderboard_hiding_allowed then
    raise exception 'hiding_not_allowed';
  end if;
  -- Requests waiting for approval are capped too, so a link can't flood a group.
  if g.join_policy = 'request_to_join'
     and (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'pending')
         >= g.max_members then
    raise exception 'group_full';
  end if;

  v_new := case g.join_policy when 'request_to_join' then 'pending' else 'active' end;
  insert into public.group_members (group_id, user_id, role, status, share_level, leaderboard_hidden,
                                    invite_id, covenant_accepted_at, joined_at)
  values (g.id, v_uid, 'member', v_new, p_share_level, coalesce(p_leaderboard_hidden, false),
          i.id, now(), case when v_new = 'active' then now() end);
  update public.group_invites set use_count = use_count + 1 where id = i.id;

  perform private.group_audit(v_uid, case v_new when 'active' then 'group.member_joined'
                                                else 'group.join_requested' end,
                              g.id, null, jsonb_build_object('invite', i.id));
  return query select v_new, g.id;
end;
$$;

revoke all on function public.create_group_invite(uuid, text, text, integer, integer) from public, anon;
revoke all on function public.revoke_group_invite(uuid) from public, anon;
revoke all on function public.preview_group_invite(text, text) from public;
revoke all on function public.group_invite_details(text, text) from public, anon;
revoke all on function public.join_group(text, text, text, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.create_group_invite(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.revoke_group_invite(uuid) to authenticated;
grant execute on function public.preview_group_invite(text, text) to anon, authenticated;
grant execute on function public.group_invite_details(text, text) to authenticated;
grant execute on function public.join_group(text, text, text, boolean, boolean, timestamptz) to authenticated;
