-- checkins: daily check-ins and streaks (CLAUDE.md §6, §7.5). See
-- docs/decisions.md D-042 to D-047.
--
--   checkins            one row per person per local day ("today" in their own
--                       time zone), counted in every group they belong to.
--   user_stats          streaks and totals, recalculated by replaying the
--                       person's check-ins whenever one is saved.
--   group_member_stats  the person's clean days and check-ins inside each
--                       group's challenge.
--
-- All three are private to their owner. Nobody writes them directly: every
-- change goes through the security-definer functions in the next migration.
-- Other members see check-ins only through public.group_checkins_today, which
-- applies the member's share level in that group. Every table has the
-- RESTRICTIVE util.session_ok() policy (D-028).

-- ---------------------------------------------------------------- constants

-- The fixed list of triggers (§7.5), in display order.
create or replace function util.checkin_triggers()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['bored', 'lonely', 'stressed', 'tired', 'late_night', 'alone_with_phone', 'social_media', 'other'];
$$;

grant execute on function util.checkin_triggers() to authenticated, service_role;

-- ---------------------------------------------------------------- checkins

create table public.checkins (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The day being answered for, in the person's own time zone (§5).
  local_date date not null,
  -- The zone "today" was worked out in when the check-in was saved.
  timezone text not null check (char_length(timezone) <= 64),
  outcome text not null check (outcome in ('clean', 'slipped')),
  mood smallint check (mood between 1 and 5),
  urge_level smallint check (urge_level between 0 and 5),
  triggers text[] not null default '{}'
    check (triggers <@ util.checkin_triggers() and cardinality(triggers) <= 8),
  -- "v1:<iv>:<tag>:<ciphertext>" (base64url), encrypted by the app with the
  -- person's id and the date bound in (D-025, D-044). Never plaintext.
  note_encrypted text check (
    note_encrypted is null
    or (note_encrypted ~ '^v[0-9]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]*$' and char_length(note_encrypted) <= 8000)
  ),
  edit_count integer not null default 0 check (edit_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One check-in per person per local day; also the (user_id, local_date)
  -- index the spec asks for.
  constraint checkins_one_per_day unique (user_id, local_date)
);

comment on table public.checkins is
  'Daily check-ins (§7.5). Sensitive (§11): readable only by their author; groups see them only through group_checkins_today.';
comment on column public.checkins.note_encrypted is
  'The private note or slip reflection, AES-256-GCM encrypted by the app. Only its author can read it.';

create trigger checkins_touch_updated_at
  before update on public.checkins
  for each row execute function util.touch_updated_at();

-- ---------------------------------------------------------------- user_stats

create table public.user_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- The clean run ending at last_checkin_date (0 if that day was a slip).
  -- It goes stale overnight: read it through util.live_count() (D-043).
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  total_clean_days integer not null default 0 check (total_clean_days >= 0),
  total_checkins integer not null default 0 check (total_checkins >= 0),
  -- Consecutive days with any check-in, ending at last_checkin_date.
  checkin_streak integer not null default 0 check (checkin_streak >= 0),
  -- How many separate clean streaks the person has built (D-046).
  clean_streaks integer not null default 0 check (clean_streaks >= 0),
  last_checkin_date date,
  last_clean_date date,
  updated_at timestamptz not null default now()
);

comment on table public.user_stats is
  'Streaks and totals (§7.5), recalculated from check-ins. Owner-only; Phase 5 adds XP and levels.';

create trigger user_stats_touch_updated_at
  before update on public.user_stats
  for each row execute function util.touch_updated_at();

-- ---------------------------------------------------------------- group_member_stats

create table public.group_member_stats (
  group_id uuid not null,
  user_id uuid not null,
  clean_days_in_challenge integer not null default 0 check (clean_days_in_challenge >= 0),
  checkins_in_challenge integer not null default 0 check (checkins_in_challenge >= 0),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  -- Goes when the membership goes (leaving deletes the row, D-038).
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on delete cascade
);

comment on table public.group_member_stats is
  'A member''s clean days and check-ins inside a group''s challenge. Owner-only: the counts could reveal a slip (D-045).';

create index group_member_stats_user_idx on public.group_member_stats (user_id);

create trigger group_member_stats_touch_updated_at
  before update on public.group_member_stats
  for each row execute function util.touch_updated_at();

-- ---------------------------------------------------------------- RLS

alter table public.checkins enable row level security;
alter table public.user_stats enable row level security;
alter table public.group_member_stats enable row level security;

revoke all on table public.checkins from anon, authenticated;
revoke all on table public.user_stats from anon, authenticated;
revoke all on table public.group_member_stats from anon, authenticated;

grant select on table public.checkins to authenticated;
grant select on table public.user_stats to authenticated;
grant select on table public.group_member_stats to authenticated;

create policy "checkins: owner reads"
  on public.checkins for select to authenticated
  using (user_id = (select auth.uid()));
create policy "user_stats: owner reads"
  on public.user_stats for select to authenticated
  using (user_id = (select auth.uid()));
create policy "group_member_stats: owner reads"
  on public.group_member_stats for select to authenticated
  using (user_id = (select auth.uid()));

-- The gate (D-028, D-030), on every table.
create policy "checkins: live, verified session" on public.checkins
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "user_stats: live, verified session" on public.user_stats
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "group_member_stats: live, verified session" on public.group_member_stats
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- ---------------------------------------------------------------- time-zone changes

-- Changing time zone moves "today", so it's worth a line in the audit log
-- (D-047). The zone itself isn't recorded: it hints at where someone lives.
create or replace function private.audit_timezone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.timezone is distinct from old.timezone then
    perform util.audit(new.id, 'profile.timezone_changed', 'user', new.id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger profiles_audit_timezone_change
  after update of timezone on public.profiles
  for each row execute function private.audit_timezone_change();
