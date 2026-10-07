-- groups: groups, membership, invites and covenant changes (CLAUDE.md §6,
-- §7.4). See docs/decisions.md D-034 to D-040.
--
-- Tenancy: one schema, a group_id on every group-scoped row, enforced by RLS.
--
--   * Nobody writes these tables directly. Every change goes through a
--     security-definer function (next migration) that checks the caller's
--     role in that one group, writes the audit row and makes the change in a
--     single transaction. Calling the API directly with another group's id
--     therefore changes nothing.
--   * Reads go through RLS: a group's rows are visible only to its active
--     members (a pending request sees the group itself, nothing else).
--   * Every table also has the RESTRICTIVE util.session_ok() policy (D-028).

-- ---------------------------------------------------------------- groups

create table public.groups (
  id uuid primary key default util.uuid_v7(),
  name text not null check (char_length(name) between 3 and 60 and name = btrim(name)),
  -- Generated, unique, never used in URLs (URLs use the id, so a group's name
  -- never appears in browser history; D-035).
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  description text check (char_length(description) <= 500),
  -- The group picture: same pipeline as avatars (D-036). Paths are
  -- "<group id>/<random>", written by the server only.
  cover_path text,
  cover_pending_path text,
  cover_status text not null default 'none'
    check (cover_status in ('none', 'pending_review', 'ready', 'rejected')),
  owner_id uuid not null references auth.users (id) on delete restrict,
  challenge_type text not null check (challenge_type in ('30', '40', '60', '90', 'custom', 'ongoing')),
  -- Length in days for every type except ongoing.
  challenge_days integer,
  start_date date not null,
  end_date date,
  group_timezone text not null check (char_length(group_timezone) <= 64),
  covenant_text text not null check (char_length(covenant_text) between 10 and 2000),
  min_share_level text not null default 'checkin_only'
    check (min_share_level in ('checkin_only', 'streak', 'full')),
  leaderboard_hiding_allowed boolean not null default true,
  join_policy text not null default 'invite_only' check (join_policy in ('invite_only', 'request_to_join')),
  max_members integer not null default 50 check (max_members between 2 and 500),
  -- Active members, kept by a trigger (§14: counters, not COUNT(*)).
  member_count integer not null default 0 check (member_count >= 0),
  archived_at timestamptz,
  covenant_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint groups_challenge_dates check (
    case
      when challenge_type = 'ongoing' then challenge_days is null and end_date is null
      when challenge_type = 'custom' then challenge_days between 7 and 365
                                          and end_date = start_date + (challenge_days - 1)
      else challenge_days = challenge_type::integer and end_date = start_date + (challenge_days - 1)
    end
  ),
  constraint groups_cover_paths check (
    (cover_path is null or cover_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{16,64}$'))
    and (cover_pending_path is null or cover_pending_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{16,64}$'))
  )
);

comment on table public.groups is
  'Isolated group challenges (CLAUDE.md §7.4). Written only through the groups functions.';
comment on column public.groups.min_share_level is
  'The covenant''s accountability level: every member shares at least this much with the group (D-027).';
comment on column public.groups.leaderboard_hiding_allowed is
  'Covenant: whether members may hide from the group''s leaderboards (D-027).';

create index groups_owner_idx on public.groups (owner_id);

create trigger groups_touch_updated_at
  before update on public.groups
  for each row execute function util.touch_updated_at();

create or replace function private.check_group_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.group_timezone is distinct from old.group_timezone then
    if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.group_timezone) then
      raise exception 'timezone_invalid' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger groups_check_fields
  before insert or update of group_timezone on public.groups
  for each row execute function private.check_group_fields();

-- ---------------------------------------------------------------- invites

create table public.group_invites (
  id uuid primary key default util.uuid_v7(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- SHA-256 of the 160-bit link token; the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- HMAC-SHA256 of the short code, keyed with a server-only secret (D-037).
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  max_uses integer check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.group_invites is
  'Invite links, codes and QR codes. Only admins of the group see them; the hashes are never readable over the API.';

create index group_invites_group_idx on public.group_invites (group_id, created_at desc);
create index group_invites_created_by_idx on public.group_invites (created_by);

-- ---------------------------------------------------------------- members

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  -- Leaving deletes the row (D-038), so 'left' is never stored. 'removed'
  -- rows stay, so a removed member can't rejoin by invite until an admin
  -- allows them back.
  status text not null check (status in ('active', 'pending', 'removed')),
  share_level text not null check (share_level in ('checkin_only', 'streak', 'full')),
  leaderboard_hidden boolean not null default false,
  invite_id uuid references public.group_invites (id) on delete set null,
  covenant_accepted_at timestamptz,
  requested_at timestamptz not null default now(),
  joined_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_owner_active check (role <> 'owner' or status = 'active'),
  constraint group_members_joined check (status <> 'active' or joined_at is not null)
);

comment on table public.group_members is
  'Membership is sensitive (it reveals faith and the struggle, §11). Written only through the groups functions.';

-- Exactly one owner per group.
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';
create index group_members_user_idx on public.group_members (user_id, status);
create index group_members_group_status_idx on public.group_members (group_id, status, joined_at);

create trigger group_members_touch_updated_at
  before update on public.group_members
  for each row execute function util.touch_updated_at();

-- A member never shares less than the covenant asks, and hides from the
-- leaderboard only where the group allows it.
create or replace function private.check_group_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
  rank_of constant jsonb := '{"checkin_only": 0, "streak": 1, "full": 2}';
begin
  select * into g from public.groups where id = new.group_id;
  if (rank_of ->> new.share_level)::int < (rank_of ->> g.min_share_level)::int then
    raise exception 'share_level_too_low' using errcode = '23514';
  end if;
  if new.leaderboard_hidden and not g.leaderboard_hiding_allowed then
    raise exception 'hiding_not_allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger group_members_check
  before insert or update of share_level, leaderboard_hidden on public.group_members
  for each row execute function private.check_group_member();

-- Keeps groups.member_count equal to the number of active members.
create or replace function private.count_group_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_active boolean := tg_op in ('UPDATE', 'DELETE') and old.status = 'active';
  is_active boolean := tg_op in ('INSERT', 'UPDATE') and new.status = 'active';
begin
  if was_active and not is_active then
    update public.groups set member_count = member_count - 1 where id = old.group_id;
  elsif is_active and not was_active then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
  end if;
  return null;
end;
$$;

create trigger group_members_count
  after insert or update of status or delete on public.group_members
  for each row execute function private.count_group_members();

-- ---------------------------------------------------------------- covenant changes

-- Relaxing the covenant applies at once. Tightening it (a higher minimum
-- share level, no more leaderboard hiding, or new covenant text) once others
-- have joined needs every other active member to agree (D-039).
create table public.group_covenant_proposals (
  id uuid primary key default util.uuid_v7(),
  group_id uuid not null references public.groups (id) on delete cascade,
  proposed_by uuid references auth.users (id) on delete set null,
  covenant_text text not null check (char_length(covenant_text) between 10 and 2000),
  min_share_level text not null check (min_share_level in ('checkin_only', 'streak', 'full')),
  leaderboard_hiding_allowed boolean not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  closed_at timestamptz,
  outcome text check (outcome in ('applied', 'declined', 'withdrawn', 'expired')),
  constraint group_covenant_proposals_closed check ((closed_at is null) = (outcome is null))
);

-- One open proposal per group.
create unique index group_covenant_proposals_one_open
  on public.group_covenant_proposals (group_id) where closed_at is null;
create index group_covenant_proposals_group_idx on public.group_covenant_proposals (group_id, created_at desc);

create table public.group_covenant_agreements (
  proposal_id uuid not null references public.group_covenant_proposals (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  agreed_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create index group_covenant_agreements_group_idx on public.group_covenant_agreements (group_id, proposal_id);
create index group_covenant_agreements_user_idx on public.group_covenant_agreements (user_id);

-- ---------------------------------------------------------------- helpers

-- An account that is not closing or closed.
create or replace function util.account_open(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user and p.deleted_at is null and p.deletion_requested_at is null
  );
$$;

-- The caller's membership status in a group ('active', 'pending',
-- 'removed'), or null. Always null for a session that fails session_ok().
create or replace function util.group_status(p_group uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.status from public.group_members m
   where m.group_id = p_group and m.user_id = auth.uid() and util.session_ok();
$$;

-- The caller's role in a group where they are an active member, or null.
create or replace function util.group_role(p_group uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.group_members m
   where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'active' and util.session_ok();
$$;

create or replace function util.is_active_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select util.group_role(p_group) is not null;
$$;

create or replace function util.is_group_admin(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(util.group_role(p_group) in ('owner', 'admin'), false);
$$;

revoke all on function util.account_open(uuid) from public, anon;
revoke all on function util.group_status(uuid) from public, anon;
revoke all on function util.group_role(uuid) from public, anon;
revoke all on function util.is_active_member(uuid) from public, anon;
revoke all on function util.is_group_admin(uuid) from public, anon;
grant execute on function util.account_open(uuid) to authenticated, service_role;
grant execute on function util.group_status(uuid) to authenticated, service_role;
grant execute on function util.group_role(uuid) to authenticated, service_role;
grant execute on function util.is_active_member(uuid) to authenticated, service_role;
grant execute on function util.is_group_admin(uuid) to authenticated, service_role;

-- Profile cards (D-022) now open up between people who share a group: both
-- active members of the same group. A group's admins also see the cards of
-- people asking to join, and of people they removed (to allow them back).
create or replace function util.shares_group(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and owner is not null and exists (
    select 1
      from public.group_members v
      join public.group_members o on o.group_id = v.group_id
     where v.user_id = viewer
       and o.user_id = owner
       and v.status = 'active'
       and (o.status = 'active' or (o.status in ('pending', 'removed') and v.role in ('owner', 'admin')))
  );
$$;

-- ---------------------------------------------------------------- RLS

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_covenant_proposals enable row level security;
alter table public.group_covenant_agreements enable row level security;

-- Supabase grants everything on new public tables by default; take it back.
revoke all on table public.groups from anon, authenticated;
revoke all on table public.group_members from anon, authenticated;
revoke all on table public.group_invites from anon, authenticated;
revoke all on table public.group_covenant_proposals from anon, authenticated;
revoke all on table public.group_covenant_agreements from anon, authenticated;

grant select on table public.groups to authenticated;
grant select on table public.group_members to authenticated;
grant select on table public.group_covenant_proposals to authenticated;
grant select on table public.group_covenant_agreements to authenticated;
-- Never the hashes.
grant select (id, group_id, created_by, expires_at, max_uses, use_count, revoked_at, created_at)
  on table public.group_invites to authenticated;

create policy "groups: members and people asking to join read"
  on public.groups for select to authenticated
  using (util.group_status(id) in ('active', 'pending'));

-- Your own row always. Active members see the group's active members, except
-- accounts that are closing (D-033). Admins also see requests and removals.
create policy "group_members: members read their group"
  on public.group_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      util.account_open(user_id)
      and (
        (status = 'active' and util.is_active_member(group_id))
        or util.is_group_admin(group_id)
      )
    )
  );

create policy "group_invites: admins read"
  on public.group_invites for select to authenticated
  using (util.is_group_admin(group_id));

create policy "group_covenant_proposals: members read"
  on public.group_covenant_proposals for select to authenticated
  using (util.is_active_member(group_id));

create policy "group_covenant_agreements: members read"
  on public.group_covenant_agreements for select to authenticated
  using (util.is_active_member(group_id));

-- The gate (D-028, D-030), on every table.
create policy "groups: live, verified session" on public.groups
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "group_members: live, verified session" on public.group_members
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "group_invites: live, verified session" on public.group_invites
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "group_covenant_proposals: live, verified session" on public.group_covenant_proposals
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "group_covenant_agreements: live, verified session" on public.group_covenant_agreements
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
