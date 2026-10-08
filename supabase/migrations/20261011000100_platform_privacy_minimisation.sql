-- platform: data minimisation (privacy and discretion review 1; D-056, D-057).
--
-- 1. Google sign-in copies the person's real name and Google profile photo
--    into auth.users.raw_user_meta_data and auth.identities.identity_data.
--    Supabase also puts user_metadata into every access token, so the name
--    travelled in each request's cookie. The app never uses either: people
--    choose their own display name and photo. A trigger keeps only the keys
--    Supabase Auth needs, on every insert and update (Auth writes the
--    provider's data again at each sign-in).
--
-- 2. Supabase Auth records IP addresses and full browser strings for its
--    own bookkeeping (auth.audit_log_entries, auth.sessions,
--    auth.mfa_challenges), and keeps OAuth flow rows that can hold Google's
--    tokens (auth.flow_state). The Privacy Policy says we don't keep IP
--    addresses, and our own audit_log already records security events with
--    a coarse device name. The hourly clean-up now blanks or removes them.
--
-- 3. private.rate_limit_counters kept one row per person and bucket for
--    ever, i.e. "when this person last saved a check-in". Rows whose window
--    has passed are removed hourly.

-- ---------------------------------------------------------------- 1. provider profile

-- Keys Supabase Auth itself relies on: sub, iss, email, email_verified,
-- phone_verified, provider_id. Everything else a provider sends (name,
-- full_name, avatar_url, picture, given_name, …) is dropped. The list is
-- written out in full below, not in a helper function, because the
-- triggers run as Supabase Auth's own role, which can't see our schemas.

create or replace function private.strip_provider_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  extra text[];
begin
  if tg_table_name = 'identities' then
    select coalesce(array_agg(k), '{}') into extra
      from jsonb_object_keys(coalesce(new.identity_data, '{}'::jsonb)) k
     where k <> all (array['sub', 'iss', 'email', 'email_verified', 'phone_verified', 'provider_id']);
    new.identity_data := new.identity_data - extra;
  else
    select coalesce(array_agg(k), '{}') into extra
      from jsonb_object_keys(coalesce(new.raw_user_meta_data, '{}'::jsonb)) k
     where k <> all (array['sub', 'iss', 'email', 'email_verified', 'phone_verified', 'provider_id']);
    new.raw_user_meta_data := new.raw_user_meta_data - extra;
  end if;
  return new;
end;
$$;

revoke all on function private.strip_provider_profile() from public;

-- BEFORE triggers run in name order: on_auth_user_before_insert reads the
-- sign-up ticket from the metadata first ("b" < "s"), then this drops it
-- along with everything else.
create trigger on_auth_user_strip_profile
  before insert or update on auth.users
  for each row
  when ((coalesce(new.raw_user_meta_data, '{}'::jsonb) - array['sub', 'iss', 'email', 'email_verified', 'phone_verified', 'provider_id']) <> '{}'::jsonb)
  execute function private.strip_provider_profile();

create trigger on_auth_identity_strip_profile
  before insert or update on auth.identities
  for each row
  when ((coalesce(new.identity_data, '{}'::jsonb) - array['sub', 'iss', 'email', 'email_verified', 'phone_verified', 'provider_id']) <> '{}'::jsonb)
  execute function private.strip_provider_profile();

-- Accounts made before this migration (the triggers do the stripping).
update auth.users
   set raw_user_meta_data = raw_user_meta_data
 where (coalesce(raw_user_meta_data, '{}'::jsonb) - array['sub', 'iss', 'email', 'email_verified', 'phone_verified', 'provider_id']) <> '{}'::jsonb;
update auth.identities
   set identity_data = identity_data
 where (coalesce(identity_data, '{}'::jsonb) - array['sub', 'iss', 'email', 'email_verified', 'phone_verified', 'provider_id']) <> '{}'::jsonb;

-- ---------------------------------------------------------------- 2 and 3. hourly clean-up

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

  -- Device rows for sessions that have ended, and devices unused for a year.
  delete from private.session_devices sd
   where not exists (select 1 from auth.sessions s where s.id = sd.session_id);
  delete from private.known_devices
   where last_seen_at < now() - interval '1 year';

  -- Two-step marks for sessions that have ended (D-050).
  delete from private.mfa_verified_sessions v
   where not exists (select 1 from auth.sessions s where s.id = v.session_id);

  -- Supabase Auth's own records (D-057): no IP addresses or browser
  -- strings kept; its audit trail only for a day (ours is public.audit_log).
  update auth.sessions
     set ip = null, user_agent = null
   where ip is not null or user_agent is not null;
  delete from auth.audit_log_entries
   where created_at < now() - interval '1 day';
  update auth.audit_log_entries
     set ip_address = ''
   where ip_address <> '';
  -- Two-step challenges last minutes; OAuth flows too (they can hold the
  -- provider's tokens).
  delete from auth.mfa_challenges
   where created_at < now() - interval '1 hour';
  delete from auth.flow_state
   where created_at < now() - interval '1 hour';

  -- Rate-limit windows that have passed (the longest is a day).
  delete from private.rate_limit_counters
   where window_started_at < now() - interval '1 day';
end;
$$;

revoke all on function private.hourly_auth_maintenance() from public;
