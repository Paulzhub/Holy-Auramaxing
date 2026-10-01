-- platform: baseline extensions and helpers shared by every module.
--
-- Migration file names carry the owning module after the timestamp
-- (platform_, auth_, groups_, checkins_ …); see docs/decisions.md (D-003).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

-- A private schema for helpers. It is not in the API's exposed schemas,
-- so nothing here is callable over the REST or GraphQL endpoints.
create schema if not exists util;
revoke all on schema util from public;
grant usage on schema util to authenticated, service_role;

-- UUIDv7 (RFC 9562): 48-bit Unix-millisecond timestamp, version 7, variant
-- 0b10, then random bits. Time-ordered IDs keep B-tree indexes compact.
-- Postgres 17 has no built-in uuidv7(); swap for it when Supabase ships PG 18.
create or replace function util.uuid_v7()
returns uuid
language plpgsql
volatile
parallel safe
set search_path = ''
as $$
declare
  ts_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  bytes bytea;
begin
  bytes := substring(int8send(ts_ms) from 3) || extensions.gen_random_bytes(10);
  -- version nibble = 0111
  bytes := set_byte(bytes, 6, (b'0111' || get_byte(bytes, 6)::bit(4))::bit(8)::int);
  -- variant bits = 10
  bytes := set_byte(bytes, 8, (b'10' || get_byte(bytes, 8)::bit(6))::bit(8)::int);
  return encode(bytes, 'hex')::uuid;
end;
$$;

comment on function util.uuid_v7() is 'Time-ordered UUID (version 7). Default for every primary key.';

revoke all on function util.uuid_v7() from public;
grant execute on function util.uuid_v7() to authenticated, service_role;
