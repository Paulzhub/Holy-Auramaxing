-- profile: onboarding (CLAUDE.md §7.2).
--
--   profile_private        the optional "my why", encrypted by the app
--                          (AES-256-GCM) before it reaches the database.
--                          Readable only by its author.
--   notification_settings  reminder time, discreet mode and quiet hours.
--                          Phase 7 extends it with per-type channels.
--   complete_onboarding()  marks onboarding finished (the column itself
--                          isn't writable by the user).
-- See docs/decisions.md D-025.

create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- "v1:<iv>:<tag>:<ciphertext>" (base64url). Never plaintext.
  my_why_encrypted text check (my_why_encrypted is null or my_why_encrypted ~ '^v[0-9]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]*$'),
  updated_at timestamptz not null default now()
);

comment on table public.profile_private is
  'Author-only private notes about a profile ("my why"). Encrypted by the app; nobody else can read them, admins included.';

create trigger profile_private_touch_updated_at
  before update on public.profile_private
  for each row execute function util.touch_updated_at();

alter table public.profile_private enable row level security;

create policy "profile_private: owner reads"
  on public.profile_private for select to authenticated
  using (user_id = (select auth.uid()));
create policy "profile_private: owner inserts"
  on public.profile_private for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "profile_private: owner updates"
  on public.profile_private for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.profile_private from anon, authenticated;
grant select, insert (user_id, my_why_encrypted), update (my_why_encrypted) on table public.profile_private to authenticated;

create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Local time in the user's time zone; null means no daily reminder.
  reminder_time time,
  -- On by default: notifications and emails never mention the topic (§7.8).
  discreet_mode boolean not null default true,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  updated_at timestamptz not null default now()
);

create trigger notification_settings_touch_updated_at
  before update on public.notification_settings
  for each row execute function util.touch_updated_at();

alter table public.notification_settings enable row level security;

create policy "notification_settings: owner reads"
  on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notification_settings: owner updates"
  on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.notification_settings from anon, authenticated;
grant select on table public.notification_settings to authenticated;
grant update (reminder_time, discreet_mode, quiet_hours_start, quiet_hours_end)
  on table public.notification_settings to authenticated;

-- New accounts get default notification settings too.
create or replace function private.create_account(p_user_id uuid, t private.signup_tickets, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, handle, timezone, adult_confirmed_at)
  values (p_user_id, private.generate_handle(), t.timezone, t.adult_confirmed_at);

  insert into public.privacy_settings (user_id) values (p_user_id);
  insert into public.notification_settings (user_id) values (p_user_id);

  insert into public.consents (user_id, kind, policy_version, granted_at)
  values (p_user_id, 'terms_privacy', t.policy_version, t.consented_at),
         (p_user_id, 'sensitive_data', t.policy_version, t.consented_at);

  perform util.audit(p_user_id, 'account.created', 'user', p_user_id, jsonb_build_object('method', p_method));
end;
$$;

-- Accounts created before this migration.
insert into public.notification_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- Marks the signed-in user's onboarding as finished. Idempotent.
create or replace function public.complete_onboarding()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set onboarded_at = coalesce(onboarded_at, now())
   where id = (select auth.uid());
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
