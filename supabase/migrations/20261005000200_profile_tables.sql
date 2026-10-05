-- profile: profiles and privacy settings (CLAUDE.md §6, §7.3).
--
-- Rows are created only by the auth module's sign-up functions, never by the
-- API. A user reads and edits only their own row. Everyone else sees a
-- profile only through public.profile_cards, which applies the owner's
-- privacy settings field by field.

create or replace function util.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Lower-case, 3–20 characters of a–z, 0–9 and underscore. Uniqueness is
  -- therefore case-insensitive without needing citext.
  handle text not null unique
    check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 200),
  avatar_status text not null default 'none'
    check (avatar_status in ('none', 'processing', 'pending_review', 'ready', 'rejected')),
  bio text check (char_length(bio) <= 280),
  testimony text check (char_length(testimony) <= 2000),
  favourite_verse text check (char_length(favourite_verse) <= 200),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  locale text not null default 'en' check (locale in ('en')),
  theme_pref text not null default 'system' check (theme_pref in ('light', 'dark', 'system')),
  adult_confirmed_at timestamptz not null,
  onboarded_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.profiles is
  'One row per account. Owner-only through RLS; other people read public.profile_cards.';

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function util.touch_updated_at();

-- Handles that would confuse people or impersonate the app.
create table private.reserved_handles (handle text primary key);
insert into private.reserved_handles (handle) values
  ('admin'), ('administrator'), ('aura'), ('auramaxxxing'), ('holy_auramaxxxing'),
  ('support'), ('help'), ('moderator'), ('mod'), ('staff'), ('team'), ('official'),
  ('system'), ('root'), ('null'), ('undefined'), ('anonymous'), ('hidden'),
  ('security'), ('privacy'), ('settings'), ('me'), ('you'), ('everyone'), ('god'),
  ('jesus'), ('christ'), ('holy_spirit'), ('pastor');

create or replace function private.check_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.handle is distinct from old.handle then
    if exists (select 1 from private.reserved_handles r where r.handle = new.handle) then
      raise exception 'handle_reserved' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
      raise exception 'timezone_invalid' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_check_fields
  before insert or update of handle, timezone on public.profiles
  for each row execute function private.check_profile_fields();

alter table public.profiles enable row level security;

create policy "profiles: owner reads"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: owner updates"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column-level privileges: the owner may change only these fields directly.
-- Everything else (age confirmation, avatar status, deletion, onboarding)
-- changes only through server functions.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (handle, display_name, bio, testimony, favourite_verse, timezone, locale, theme_pref)
  on table public.profiles to authenticated;

create table public.privacy_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  profile_visibility text not null default 'groups' check (profile_visibility in ('groups', 'partners', 'nobody')),
  bio_visibility text not null default 'groups' check (bio_visibility in ('groups', 'partners', 'nobody')),
  -- Testimonies are personal, so they start with partners only.
  testimony_visibility text not null default 'partners' check (testimony_visibility in ('groups', 'partners', 'nobody')),
  verse_visibility text not null default 'groups' check (verse_visibility in ('groups', 'partners', 'nobody')),
  show_in_leaderboards boolean not null default true,
  -- The most private level until the user chooses otherwise.
  default_share_level text not null default 'checkin_only'
    check (default_share_level in ('checkin_only', 'streak', 'full')),
  updated_at timestamptz not null default now()
);

create trigger privacy_settings_touch_updated_at
  before update on public.privacy_settings
  for each row execute function util.touch_updated_at();

alter table public.privacy_settings enable row level security;

create policy "privacy_settings: owner reads"
  on public.privacy_settings for select to authenticated
  using (user_id = (select auth.uid()));

create policy "privacy_settings: owner updates"
  on public.privacy_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.privacy_settings from anon, authenticated;
grant select on table public.privacy_settings to authenticated;
grant update (profile_visibility, bio_visibility, testimony_visibility, verse_visibility,
              show_in_leaderboards, default_share_level)
  on table public.privacy_settings to authenticated;

-- Relationship checks. Groups (Phase 3) and partnerships (Phase 6) replace
-- these bodies; until then nobody shares anything with anybody.
create or replace function util.shares_group(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

create or replace function util.are_partners(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

-- Can `viewer` see something the owner has set to `visibility`?
create or replace function util.can_see(viewer uuid, owner uuid, visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and (
    viewer = owner
    or (visibility = 'groups' and (util.shares_group(viewer, owner) or util.are_partners(viewer, owner)))
    or (visibility = 'partners' and util.are_partners(viewer, owner))
  );
$$;

revoke all on function util.shares_group(uuid, uuid) from public, anon;
revoke all on function util.are_partners(uuid, uuid) from public, anon;
revoke all on function util.can_see(uuid, uuid, text) from public, anon;
grant execute on function util.shares_group(uuid, uuid) to authenticated, service_role;
grant execute on function util.are_partners(uuid, uuid) to authenticated, service_role;
grant execute on function util.can_see(uuid, uuid, text) to authenticated, service_role;

-- What other people may see of a profile. The view runs with its owner's
-- rights (it reads past RLS) and filters every row and field itself, so it
-- is the only way to read someone else's profile. Accounts scheduled for
-- deletion disappear from it immediately.
create view public.profile_cards
with (security_barrier = true)
as
select
  p.id,
  p.handle,
  p.display_name,
  case when p.avatar_status = 'ready' then p.avatar_path end as avatar_path,
  case when util.can_see(auth.uid(), p.id, s.bio_visibility) then p.bio end as bio,
  case when util.can_see(auth.uid(), p.id, s.testimony_visibility) then p.testimony end as testimony,
  case when util.can_see(auth.uid(), p.id, s.verse_visibility) then p.favourite_verse end as favourite_verse,
  p.created_at as joined_at
from public.profiles p
join public.privacy_settings s on s.user_id = p.id
where p.deleted_at is null
  and p.deletion_requested_at is null
  and util.can_see(auth.uid(), p.id, s.profile_visibility);

comment on view public.profile_cards is
  'Profiles as other people may see them, with each field filtered by the owner''s privacy settings.';

revoke all on table public.profile_cards from anon, authenticated;
grant select on table public.profile_cards to authenticated;
