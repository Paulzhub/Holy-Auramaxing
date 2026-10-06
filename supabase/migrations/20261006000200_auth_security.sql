-- auth: two-factor, devices and sessions (CLAUDE.md §7.1, Phase 2d; D-028–D-030).
--
--  * util.session_ok(): the caller's session still exists and, if they have
--    an authenticator app set up, has passed it (aal2). Every personal table
--    gets a RESTRICTIVE policy using it, so a stolen password alone (aal1)
--    reads nothing, and a signed-out session stops working at once instead
--    of when its access token expires.
--  * private.known_devices / private.session_devices: which device each
--    session runs on (a random device cookie, stored hashed) for the sessions
--    page and new-device emails. Supabase only sees our server's user agent,
--    so it can't tell us. No IP addresses.
--  * private.mfa_recovery_codes: one-time recovery codes, stored as keyed
--    hashes (HMAC with a server-only secret).

-- ---------------------------------------------------------------- the gate

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
    -- Two-factor: anyone with a verified authenticator app must be at aal2.
    -- Passkeys are not factors here (Supabase signs them in at aal1).
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      )
    );
$$;

revoke all on function util.session_ok() from public, anon;
grant execute on function util.session_ok() to authenticated, service_role;

comment on function util.session_ok() is
  'True when the caller''s session is live and has passed two-factor if they use it (D-028, D-030).';

-- Why a signed-in request was refused, so the app can send the person to the
-- right place (/sign-in/verify, or sign them out). Callable at aal1.
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
    coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
      and exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.auth_gate() from public, anon;
grant execute on function public.auth_gate() to authenticated;

-- Restrictive policies are ANDed with the existing owner policies.
create policy "profiles: live, verified session" on public.profiles
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "privacy_settings: live, verified session" on public.privacy_settings
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "consents: live, verified session" on public.consents
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "notification_settings: live, verified session" on public.notification_settings
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "profile_private: live, verified session" on public.profile_private
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- Other people's profiles (profile_cards) go through util.can_see, so the
-- same gate covers them. Phase 3's group checks will use it too.
create or replace function util.can_see(viewer uuid, owner uuid, visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and util.session_ok() and (
    viewer = owner
    or (visibility = 'groups' and (util.shares_group(viewer, owner) or util.are_partners(viewer, owner)))
    or (visibility = 'partners' and util.are_partners(viewer, owner))
  );
$$;

-- ---------------------------------------------------------------- devices

create table private.known_devices (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- SHA-256 (base64url) of the random device cookie; the cookie itself is never stored.
  device_hash text not null check (device_hash ~ '^[A-Za-z0-9_-]{43}$'),
  -- Coarse description such as "Chrome on Windows".
  label text not null check (char_length(label) between 1 and 60),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

create table private.session_devices (
  -- auth.sessions(id). No foreign key into Supabase's auth schema beyond
  -- auth.users; rows for ended sessions are removed hourly.
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null references private.known_devices (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index session_devices_user_idx on private.session_devices (user_id);

comment on table private.known_devices is
  'Devices each person has signed in on (hashed device cookie + coarse label). No IPs. Server-only (D-030).';

-- Called by the server (secret key) after every successful first step of a
-- sign-in. Returns 'first' (the account's first device: no email),
-- 'known' or 'new' (send the new-device email).
create or replace function public.record_session_device(
  p_user_id uuid,
  p_session_id uuid,
  p_device_hash text,
  p_label text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
  v_had_devices boolean;
  v_result text;
begin
  select id into v_device_id
    from private.known_devices
   where user_id = p_user_id and device_hash = p_device_hash;

  if v_device_id is null then
    select exists (select 1 from private.known_devices where user_id = p_user_id) into v_had_devices;
    insert into private.known_devices (user_id, device_hash, label)
    values (p_user_id, p_device_hash, left(p_label, 60))
    on conflict (user_id, device_hash) do update set last_seen_at = now()
    returning id into v_device_id;
    v_result := case when v_had_devices then 'new' else 'first' end;
  else
    update private.known_devices
       set last_seen_at = now(), label = left(p_label, 60)
     where id = v_device_id;
    v_result := 'known';
  end if;

  insert into private.session_devices (session_id, user_id, device_id)
  values (p_session_id, p_user_id, v_device_id)
  on conflict (session_id) do update set device_id = excluded.device_id;

  return v_result;
end;
$$;

revoke all on function public.record_session_device(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_session_device(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------- sessions

-- The caller's own sessions, newest activity first. No IP addresses.
create or replace function public.my_sessions()
returns table (
  id uuid,
  device text,
  signed_in_at timestamptz,
  last_active_at timestamptz,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    d.label,
    s.created_at,
    greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC'),
    s.id = (auth.jwt() ->> 'session_id')::uuid
  from auth.sessions s
  left join private.session_devices sd on sd.session_id = s.id
  left join private.known_devices d on d.id = sd.device_id
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
    and util.session_ok()
  order by 4 desc
  limit 100;
$$;

-- Signs out one of the caller's own sessions. Its refresh tokens go with it
-- (cascade), and util.session_ok() refuses its access token at once.
create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not util.session_ok() then
    return false;
  end if;
  delete from auth.sessions where id = p_session_id and user_id = auth.uid();
  get diagnostics v_count = row_count;
  delete from private.session_devices where session_id = p_session_id and user_id = auth.uid();
  return v_count > 0;
end;
$$;

revoke all on function public.my_sessions() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- ---------------------------------------------------------------- recovery codes

create table private.mfa_recovery_codes (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- HMAC-SHA256 (hex) of the normalised code with a server-only key.
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

comment on table private.mfa_recovery_codes is
  'One-time two-factor recovery codes, stored as keyed hashes. Server-only (D-028).';

-- Replaces the caller's codes. Only at aal2 and only with an authenticator
-- app set up, so a stolen password can't mint codes.
create or replace function public.replace_recovery_codes(p_hashes text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
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

-- How many unused codes the caller has left.
create or replace function public.recovery_codes_remaining()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.mfa_recovery_codes
   where user_id = auth.uid() and used_at is null and util.session_ok();
$$;

-- Server-only (rate-limited there): marks one unused code as used. True when
-- it matched.
create or replace function public.use_recovery_code(p_user_id uuid, p_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update private.mfa_recovery_codes
     set used_at = now()
   where user_id = p_user_id and code_hash = p_hash and used_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- Server-only: removes all of a person's codes (two-factor turned off).
create or replace function public.clear_recovery_codes(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.mfa_recovery_codes where user_id = p_user_id;
$$;

revoke all on function public.replace_recovery_codes(text[]) from public, anon;
revoke all on function public.recovery_codes_remaining() from public, anon;
revoke all on function public.use_recovery_code(uuid, text) from public, anon, authenticated;
revoke all on function public.clear_recovery_codes(uuid) from public, anon, authenticated;
grant execute on function public.replace_recovery_codes(text[]) to authenticated;
grant execute on function public.recovery_codes_remaining() to authenticated;
grant execute on function public.use_recovery_code(uuid, text) to service_role;
grant execute on function public.clear_recovery_codes(uuid) to service_role;

-- ---------------------------------------------------------------- maintenance

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

  -- Phase 2d: device rows for sessions that have ended, and devices unused for a year.
  delete from private.session_devices sd
   where not exists (select 1 from auth.sessions s where s.id = sd.session_id);
  delete from private.known_devices
   where last_seen_at < now() - interval '1 year';
end;
$$;

revoke all on function private.hourly_auth_maintenance() from public;
