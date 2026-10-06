-- auth: data export and account deletion (CLAUDE.md §7.1, §11; Phase 2e; D-032, D-033).
--
--  * request_account_deletion() / cancel_account_deletion(): the person
--    schedules their own account for deletion, or keeps it. The profile
--    disappears from everyone else at once (profile_cards already hides it).
--  * A daily job hard-deletes accounts 14 days after the request:
--    group contributions are anonymised (a hook that Phase 3 onwards fills
--    in), the person's files are queued for removal from Storage, their
--    audit rows lose every link to them, and the auth user is deleted, which
--    cascades to every personal row.
--  * Storage files must be removed through the Storage API (deleting rows in
--    SQL would leave the files behind), so the app empties
--    private.storage_purge_queue with the secret key.
--  * my_audit_events(): the person's own security events, for the export.

-- ---------------------------------------------------------------- settings

create or replace function util.account_deletion_grace()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '14 days' $$;

comment on function util.account_deletion_grace() is
  'How long a deletion request waits before the account is erased (CLAUDE.md §7.1). Keep equal to ACCOUNT_DELETION_GRACE_DAYS in the app.';

-- Finds the accounts that are due without scanning every profile.
create index profiles_deletion_requested_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

-- ---------------------------------------------------------------- request and cancel

-- Schedules the caller's own account for deletion and signs out their other
-- devices. Asking again keeps the original date. Returns when it will be
-- erased.
create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_requested timestamptz;
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_uid is null or not util.session_ok() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.profiles
     set deletion_requested_at = coalesce(deletion_requested_at, now())
   where id = v_uid and deleted_at is null
  returning deletion_requested_at into v_requested;

  if v_requested is null then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;

  -- Every other device is signed out; this one stays to show what happens next.
  delete from auth.sessions
   where user_id = v_uid and (v_session is null or id <> v_session);
  delete from private.session_devices
   where user_id = v_uid and (v_session is null or session_id <> v_session);

  return v_requested + util.account_deletion_grace();
end;
$$;

-- Keeps the caller's account. True when there was a request to cancel.
create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not util.session_ok() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.profiles
     set deletion_requested_at = null
   where id = auth.uid() and deletion_requested_at is not null and deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------------- export helper

-- The caller's own security events (newest first), for "Download my data".
-- The same fields an admin would see: what, when, and a coarse device label.
create or replace function public.my_audit_events()
returns table (action text, created_at timestamptz, device text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.action, a.created_at, a.metadata ->> 'device'
    from public.audit_log a
   where a.actor_id = auth.uid()
     and auth.uid() is not null
     and util.session_ok()
   order by a.created_at desc
   limit 5000;
$$;

revoke all on function public.my_audit_events() from public, anon;
grant execute on function public.my_audit_events() to authenticated;

-- ---------------------------------------------------------------- storage purge queue

create table private.storage_purge_queue (
  id uuid primary key default util.uuid_v7(),
  bucket text not null check (bucket in ('avatars')),
  -- A folder inside the bucket: the former account's id. No names, no emails.
  prefix text not null check (prefix ~ '^[0-9a-f-]{36}$'),
  queued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  unique (bucket, prefix)
);

comment on table private.storage_purge_queue is
  'Storage folders of erased accounts, waiting for the app to remove the files through the Storage API (D-033). Server-only.';

-- Server-only: the next folders to empty. Each claim counts as an attempt,
-- and a folder claimed in the last 10 minutes is skipped, so two runners
-- don't work on the same one.
create or replace function public.claim_storage_purges(p_limit integer default 20)
returns table (id uuid, bucket text, prefix text)
language sql
security definer
set search_path = ''
as $$
  update private.storage_purge_queue q
     set attempts = q.attempts + 1, last_attempt_at = now()
   where q.id in (
     select x.id from private.storage_purge_queue x
      where x.last_attempt_at is null or x.last_attempt_at < now() - interval '10 minutes'
      order by x.queued_at
      limit least(greatest(p_limit, 1), 100)
      for update skip locked
   )
  returning q.id, q.bucket, q.prefix;
$$;

-- Server-only: the folder is empty now.
create or replace function public.complete_storage_purge(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.storage_purge_queue where id = p_id;
$$;

revoke all on function public.claim_storage_purges(integer) from public, anon, authenticated;
revoke all on function public.complete_storage_purge(uuid) from public, anon, authenticated;
grant execute on function public.claim_storage_purges(integer) to service_role;
grant execute on function public.complete_storage_purge(uuid) to service_role;

-- ---------------------------------------------------------------- erasure

-- Hook for every module that stores contributions other people see.
-- Phase 3 onwards adds its part here (D-033):
--   * posts and comments stay, with author_id set to null ("A former member");
--   * reactions, nudges, memberships, partnerships and invites are deleted;
--   * a group the person owns passes to its longest-serving admin, else its
--     longest-serving member, else it is archived.
-- Nothing to do yet: there are no group tables before Phase 3.
create or replace function private.anonymise_group_contributions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform p_user_id;
end;
$$;

-- Erases one account. Called only by purge_due_accounts().
create or replace function private.erase_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.anonymise_group_contributions(p_user_id);

  insert into private.storage_purge_queue (bucket, prefix)
  values ('avatars', p_user_id::text)
  on conflict (bucket, prefix) do nothing;

  -- Security records stay for their year (D-016) but no longer point at anyone.
  update public.audit_log
     set actor_id = null, target_id = null
   where actor_id = p_user_id or target_id = p_user_id;

  -- Cascades to profiles, privacy_settings, profile_private,
  -- notification_settings, consents, sign-up tickets, devices, recovery
  -- codes, and Supabase's own sessions, identities, factors and passkeys.
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function private.anonymise_group_contributions(uuid) from public;
revoke all on function private.erase_account(uuid) from public;

-- Erases every account whose grace period has ended. Returns how many.
create or replace function private.purge_due_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select p.id from public.profiles p
     where p.deletion_requested_at is not null
       and p.deletion_requested_at <= now() - util.account_deletion_grace()
     order by p.deletion_requested_at
     limit 500
     for update skip locked
  loop
    perform private.erase_account(v_id);
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform util.audit(null, 'account.deleted', null, null, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

revoke all on function private.purge_due_accounts() from public;

-- Server-only: lets the app's purge route (and the e2e tests) run the same
-- job on demand, then empty the storage queue straight away.
create or replace function public.run_account_purge()
returns integer
language sql
security definer
set search_path = ''
as $$ select private.purge_due_accounts() $$;

revoke all on function public.run_account_purge() from public, anon, authenticated;
grant execute on function public.run_account_purge() to service_role;

-- Daily, in the database itself, so erasure happens on time even when the
-- app isn't running.
select cron.schedule(
  'account-deletion-daily',
  '41 3 * * *',
  $$select private.purge_due_accounts()$$
);
