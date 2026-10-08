-- auth: two-step sign-in counts only when the app checked the code
-- (security review 1, finding SR-1; D-050).
--
-- Supabase Auth upgrades a session to aal2 whenever its own
-- /auth/v1/factors/:id/verify endpoint receives the right code. That endpoint
-- is public: anyone holding the password (an aal1 session) can call it
-- directly with the publishable key, skipping the app's limit of 5 wrong codes
-- per 15 minutes. Hosted Supabase allows 15 challenge/verify requests a minute
-- per IP address and can't be tuned; the hook that could limit attempts per
-- factor needs the Team plan. With a 6-digit code (about 3 valid codes in each
-- window) a handful of addresses finds the code within a day.
--
-- So the gate now also asks for a mark that only the app's server writes,
-- after its own rate-limited code check succeeded: a session Auth upgraded
-- some other way reads nothing and is sent back to /sign-in/verify, where
-- the 5-tries limit applies.

create table private.mfa_verified_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now()
);

comment on table private.mfa_verified_sessions is
  'Sessions whose two-step code the app itself checked (D-050). Written only by mark_session_mfa_verified().';

create index mfa_verified_sessions_user_idx on private.mfa_verified_sessions (user_id);

-- Sessions already at aal2 were verified through the app (until now the only
-- route the app offered), so they keep working.
insert into private.mfa_verified_sessions (session_id, user_id)
select s.id, s.user_id from auth.sessions s where s.aal = 'aal2'
on conflict do nothing;

-- Called by the app's server (secret key) right after its own code check.
-- Marks the session only if Auth has upgraded it to aal2 and it belongs to
-- that person.
create or replace function public.mark_session_mfa_verified(p_user_id uuid, p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.sessions s
     where s.id = p_session_id and s.user_id = p_user_id and s.aal = 'aal2'
       and (s.not_after is null or s.not_after > now())
  ) then
    return false;
  end if;
  insert into private.mfa_verified_sessions (session_id, user_id)
  values (p_session_id, p_user_id)
  on conflict (session_id) do nothing;
  return true;
end;
$$;

revoke all on function public.mark_session_mfa_verified(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_session_mfa_verified(uuid, uuid) to service_role;

-- True when the caller's session is at aal2 AND the app checked its code.
-- Tokens without a session id (test claims) only need aal2, as before.
create or replace function util.mfa_passed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and (
       auth.jwt() ->> 'session_id' is null
       or exists (
         select 1 from private.mfa_verified_sessions v
          where v.session_id = (auth.jwt() ->> 'session_id')::uuid
            and v.user_id = auth.uid()
       )
     );
$$;

revoke all on function util.mfa_passed() from public, anon;
grant execute on function util.mfa_passed() to authenticated, service_role;

create or replace function util.session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- The session hasn't been signed out. (Tokens without a session id, such
    -- as test claims, skip this part; real Supabase tokens always carry one.)
    (
      auth.jwt() ->> 'session_id' is null
      or exists (
        select 1 from auth.sessions s
         where s.id = (auth.jwt() ->> 'session_id')::uuid
           and s.user_id = auth.uid()
           and (s.not_after is null or s.not_after > now())
      )
    )
    -- Two-step sign-in: anyone with a verified authenticator app must have
    -- passed it through the app (D-030, D-050). Passkeys are not factors here.
    and (
      util.mfa_passed()
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      )
    );
$$;

create or replace function public.auth_gate()
returns table (session_active boolean, mfa_pending boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.jwt() ->> 'session_id' is null
      or exists (
        select 1 from auth.sessions s
         where s.id = (auth.jwt() ->> 'session_id')::uuid
           and s.user_id = auth.uid()
           and (s.not_after is null or s.not_after > now())
      ),
    not util.mfa_passed()
      and exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

-- Recovery codes: only from a session that passed the app's code step.
create or replace function public.replace_recovery_codes(p_hashes text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not util.mfa_passed()
     or not util.session_ok()
     or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then
    raise exception 'aal2_required' using errcode = '42501';
  end if;
  if coalesce(array_length(p_hashes, 1), 0) <> 10 then
    raise exception 'ten_codes_required' using errcode = '22023';
  end if;
  delete from private.mfa_recovery_codes where user_id = auth.uid();
  insert into private.mfa_recovery_codes (user_id, code_hash)
  select auth.uid(), h from unnest(p_hashes) as h;
  return 10;
end;
$$;

-- Marks for sessions that have ended go with the hourly clean-up.
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
end;
$$;

revoke all on function private.hourly_auth_maintenance() from public;
