-- platform: security audit log (CLAUDE.md §10) and a private schema for
-- tables that are never exposed over the API.
--
-- audit_log records security events: sign-ups, sign-ins, failures, exports,
-- deletions and (later) role changes and admin actions. It never stores
-- tokens, passwords, check-in content or IP addresses (see D-016).

create schema if not exists private;
revoke all on schema private from public;
-- Only security-definer functions owned by postgres touch this schema.

create table public.audit_log (
  id uuid primary key default util.uuid_v7(),
  -- Kept after account erasure as an anonymous event (actor set to null).
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$' and char_length(action) <= 64),
  target_type text check (char_length(target_type) <= 32),
  target_id uuid,
  -- Small, non-sensitive context only (e.g. {"method":"password"}).
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 2048),
  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Security events. Insert-only from server code and triggers; readable only by platform admins (Phase 11).';

create index audit_log_actor_created_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at);

alter table public.audit_log enable row level security;
-- No policies: the API roles can neither read nor write. Supabase grants all
-- privileges on new public tables by default, so take them back explicitly.
revoke all on table public.audit_log from anon, authenticated;
revoke update, delete, truncate on table public.audit_log from service_role;
grant select, insert on table public.audit_log to service_role;

-- Used by triggers and security-definer functions inside the database.
create or replace function util.audit(
  p_actor uuid,
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (p_actor, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;

revoke all on function util.audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function util.audit(uuid, text, text, uuid, jsonb) to service_role;
