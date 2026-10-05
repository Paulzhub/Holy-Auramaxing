-- auth: age gate, consent records and account creation (CLAUDE.md §7.1, §11).
--
-- Nobody gets an account without first confirming they are 18 or older and
-- giving consent. The sign-up pages record both in a short-lived, single-use
-- *sign-up ticket*. The browser holds only the random ticket token; the
-- database holds its SHA-256 hash.
--
--   Email sign-up: the token travels in the sign-up request's user metadata.
--   A trigger on auth.users refuses the insert unless the token matches a
--   live ticket, then creates the profile and the consent records.
--
--   Google sign-in: Supabase creates the auth user before our callback runs,
--   so the callback finishes the account with complete_oauth_signup(). If
--   there is no ticket, the callback deletes the new auth user at once. An
--   hourly job removes any auth user that still has no profile.
--
-- See docs/decisions.md D-014.

create table private.signup_tickets (
  id uuid primary key default util.uuid_v7(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  adult_confirmed_at timestamptz not null,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  consented_at timestamptz not null,
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index signup_tickets_expires_idx on private.signup_tickets (expires_at);

create table public.consents (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- terms_privacy: the Terms and Privacy Policy.
  -- sensitive_data: explicit consent to process data that reveals faith and
  -- sexual behaviour (GDPR Art. 9(2)(a); DPDP itemised notice).
  kind text not null check (kind in ('terms_privacy', 'sensitive_data')),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (user_id, kind, policy_version)
);

comment on table public.consents is
  'What each user agreed to, which policy version, and when. Written only by sign-up and consent functions.';

create index consents_user_idx on public.consents (user_id);

alter table public.consents enable row level security;

create policy "consents: owner reads"
  on public.consents for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.consents from anon, authenticated;
grant select on table public.consents to authenticated;

-- Issue a ticket. Called by the server (secret key) after the age and
-- consent steps. Returns nothing the caller doesn't already have.
create or replace function public.create_signup_ticket(
  p_token_hash text,
  p_policy_version text,
  p_timezone text default 'UTC',
  p_ttl_minutes integer default 30
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ttl_minutes not between 1 and 60 then
    raise exception 'ttl_out_of_range' using errcode = '22023';
  end if;
  insert into private.signup_tickets (token_hash, adult_confirmed_at, policy_version, consented_at, timezone, expires_at)
  values (
    lower(p_token_hash),
    now(),
    p_policy_version,
    now(),
    case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then p_timezone else 'UTC' end,
    now() + make_interval(mins => p_ttl_minutes)
  );
end;
$$;

revoke all on function public.create_signup_ticket(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_signup_ticket(text, text, text, integer) to service_role;

-- Claim a live ticket for a user. Returns the ticket, or null.
create or replace function private.claim_signup_ticket(p_token text, p_user_id uuid)
returns private.signup_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.signup_tickets;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    return null;
  end if;
  update private.signup_tickets
     set used_at = now(), user_id = p_user_id
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and used_at is null
     and expires_at > now()
  returning * into t;
  return t;
end;
$$;

-- A friendly, random starting handle; the user can change it later.
create or replace function private.generate_handle()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  candidate text;
  bytes bytea;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    candidate := 'friend_';
    for i in 0..5 loop
      candidate := candidate || substr(alphabet, (get_byte(bytes, i) % char_length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.handle = candidate);
  end loop;
  return candidate;
end;
$$;

-- Create the profile, default privacy settings and consent records.
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

  insert into public.consents (user_id, kind, policy_version, granted_at)
  values (p_user_id, 'terms_privacy', t.policy_version, t.consented_at),
         (p_user_id, 'sensitive_data', t.policy_version, t.consented_at);

  perform util.audit(p_user_id, 'account.created', 'user', p_user_id, jsonb_build_object('method', p_method));
end;
$$;

revoke all on function private.claim_signup_ticket(text, uuid) from public;
revoke all on function private.generate_handle() from public;
revoke all on function private.create_account(uuid, private.signup_tickets, text) from public;

-- BEFORE INSERT on auth.users: email sign-ups must carry a live ticket.
create or replace function private.before_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  token text := new.raw_user_meta_data ->> 'signup_ticket';
  t private.signup_tickets;
begin
  -- Never keep the token in the user's metadata (it would end up in JWTs).
  if new.raw_user_meta_data ? 'signup_ticket' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'signup_ticket';
  end if;

  if token is not null then
    t := private.claim_signup_ticket(token, null);
    if t.id is null then
      raise exception 'signup_ticket_invalid' using errcode = '28000',
        hint = 'Start again from the sign-up page.';
    end if;
    -- Remember which ticket this user claimed; AFTER INSERT links it.
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('signup_ticket_id', t.id);
  elsif provider = 'email' then
    raise exception 'signup_ticket_required' using errcode = '28000',
      hint = 'Start again from the sign-up page.';
  end if;
  -- Other providers (Google) without a ticket: allowed here; the OAuth
  -- callback either completes the account or deletes this user.
  return new;
end;
$$;

-- AFTER INSERT on auth.users: create the account for ticketed sign-ups.
create or replace function private.after_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_id uuid := (new.raw_app_meta_data ->> 'signup_ticket_id')::uuid;
  t private.signup_tickets;
begin
  if ticket_id is null then
    return null;
  end if;
  update private.signup_tickets set user_id = new.id where id = ticket_id returning * into t;
  perform private.create_account(new.id, t, coalesce(new.raw_app_meta_data ->> 'provider', 'email'));
  -- Tidy the marker out of app_metadata now that it has done its job.
  update auth.users
     set raw_app_meta_data = raw_app_meta_data - 'signup_ticket_id'
   where id = new.id;
  return null;
end;
$$;

-- Supabase Auth writes the metadata it was sent back in later updates of the
-- same request, so strip the (already used) token on every write.
create or replace function private.strip_signup_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'identities' then
    new.identity_data := new.identity_data - 'signup_ticket';
  else
    new.raw_user_meta_data := new.raw_user_meta_data - 'signup_ticket';
  end if;
  return new;
end;
$$;

-- The email identity copies the sign-up metadata too.
create trigger on_auth_identity_strip_ticket
  before insert or update on auth.identities
  for each row
  when (new.identity_data ? 'signup_ticket')
  execute function private.strip_signup_ticket();

revoke all on function private.before_auth_user_insert() from public;
revoke all on function private.after_auth_user_insert() from public;
revoke all on function private.strip_signup_ticket() from public;

create trigger on_auth_user_strip_ticket
  before update on auth.users
  for each row
  when (new.raw_user_meta_data ? 'signup_ticket')
  execute function private.strip_signup_ticket();

create trigger on_auth_user_before_insert
  before insert on auth.users
  for each row execute function private.before_auth_user_insert();

create trigger on_auth_user_after_insert
  after insert on auth.users
  for each row execute function private.after_auth_user_insert();

-- Finish a Google sign-up. Called by the OAuth callback (secret key) when a
-- signed-in user has no profile yet. Returns true when the account exists.
create or replace function public.complete_oauth_signup(p_user_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.signup_tickets;
  provider text;
begin
  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    return true;
  end if;
  select coalesce(u.raw_app_meta_data ->> 'provider', 'email') into provider
    from auth.users u where u.id = p_user_id;
  if provider is null then
    return false;
  end if;
  t := private.claim_signup_ticket(p_token, p_user_id);
  if t.id is null then
    return false;
  end if;
  perform private.create_account(p_user_id, t, provider);
  return true;
end;
$$;

revoke all on function public.complete_oauth_signup(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_oauth_signup(uuid, text) to service_role;

-- Housekeeping, run hourly by pg_cron:
--   * auth users that never finished sign-up (no profile after an hour)
--   * expired or used sign-up tickets
--   * audit events older than one year (CLAUDE.md §11 retention)
create or replace function private.hourly_auth_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  with gone as (
    delete from auth.users u
     where u.created_at < now() - interval '1 hour'
       and not exists (select 1 from public.profiles p where p.id = u.id)
    returning u.id
  )
  select count(*) into removed from gone;
  if removed > 0 then
    perform util.audit(null, 'account.orphan_removed', null, null, jsonb_build_object('count', removed));
  end if;

  delete from private.signup_tickets
   where expires_at < now() - interval '1 day';

  delete from public.audit_log
   where created_at < now() - interval '1 year';
end;
$$;

revoke all on function private.hourly_auth_maintenance() from public;

create extension if not exists pg_cron;

select cron.schedule(
  'auth-hourly-maintenance',
  '17 * * * *',
  $$select private.hourly_auth_maintenance()$$
);
