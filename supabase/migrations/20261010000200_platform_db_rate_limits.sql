-- platform: rate limits inside the database (security review 1, finding
-- SR-2; D-051).
--
-- The app's limits (src/lib/security/rate-limit.ts) run in its server
-- actions. But any signed-in person can call the write functions straight
-- through the Data API with their own access token and the publishable key,
-- skipping the app, and every call writes rows (check-ins, audit entries).
-- A loop of update_my_group_membership() wrote 200 audit rows in seconds.
--
-- private.throttle() counts calls per person and bucket in a fixed window
-- and refuses the one over the limit with SQLSTATE PT429, which PostgREST
-- turns into HTTP 429. Limits sit a little above the app's own, so people
-- using the app always meet the app's friendlier message first. A refused
-- call rolls back with its count, so the window isn't stretched by retries.
-- Only calls that go on to succeed count: a call that fails on its own
-- merits writes nothing.

create table private.rate_limit_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket ~ '^[a-z_]{1,40}$'),
  window_started_at timestamptz not null,
  hits integer not null check (hits >= 0),
  primary key (user_id, bucket)
);

comment on table private.rate_limit_counters is
  'Per-person call counts for the write functions (D-051). One row per person and bucket.';

create or replace function private.throttle(p_user uuid, p_bucket text, p_limit integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into private.rate_limit_counters as c (user_id, bucket, window_started_at, hits)
  values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    hits = case when c.window_started_at <= now() - p_window then 1 else c.hits + 1 end,
    window_started_at = case when c.window_started_at <= now() - p_window then now() else c.window_started_at end
  returning hits into v_hits;
  if v_hits > p_limit then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;
end;
$$;

revoke all on function private.throttle(uuid, text, integer, interval) from public;

-- ---------------------------------------------------------------- groups

-- Every change inside a group goes through lock_group(): one shared bucket,
-- like the app's groupManageByUser (120 an hour).
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
  perform private.throttle(caller_id, 'group_manage', 150, interval '1 hour');
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

-- Leaving doesn't go through lock_group (a pending request can be withdrawn).
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
  perform private.throttle(v_uid, 'group_manage', 150, interval '1 hour');
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

-- Starting groups: the app allows 5 a day.
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
  perform private.throttle(v_uid, 'group_create', 8, interval '1 day');
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

-- Joining: the app allows 10 an hour.
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
  perform private.throttle(v_uid, 'group_join', 20, interval '1 hour');
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

-- ---------------------------------------------------------------- check-ins

-- Saving and reflections share one bucket, like the app's checkinSaveByUser (30 an hour).
create or replace function public.submit_checkin(
  p_local_date date,
  p_outcome text,
  p_mood integer default null,
  p_urge_level integer default null,
  p_triggers text[] default '{}',
  p_note_encrypted text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.checkin_caller();
  perform private.throttle(c.caller_id, 'checkin_save', 40, interval '1 hour');
  return private.save_checkin(c.caller_id, c.tz, p_local_date, p_outcome, p_mood, p_urge_level, p_triggers,
                              p_note_encrypted, now());
end;
$$;

create or replace function public.save_checkin_reflection(
  p_local_date date,
  p_triggers text[] default '{}',
  p_note_encrypted text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.checkin_caller();
  perform private.throttle(c.caller_id, 'checkin_save', 40, interval '1 hour');
  perform private.save_checkin_reflection(c.caller_id, c.tz, p_local_date, p_triggers, p_note_encrypted, now());
end;
$$;
