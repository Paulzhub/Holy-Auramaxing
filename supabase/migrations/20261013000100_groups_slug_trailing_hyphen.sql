-- Accessibility review 1 (side find): a group name whose 40th character fell on a
-- space or punctuation produced a slug ending in "-" before the random suffix
-- ("…narrow--e2c8…"), which the slug check refuses, so creating the group failed.
-- Trim hyphens again after cutting to 40 characters.
create or replace function private.make_group_slug(p_name text)
returns text
language sql
volatile
set search_path = ''
as $$
  select coalesce(
           nullif(trim(both '-' from left(trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), 40)), ''),
           'group'
         )
         || '-' || encode(extensions.gen_random_bytes(5), 'hex');
$$;

revoke all on function private.make_group_slug(text) from public;
