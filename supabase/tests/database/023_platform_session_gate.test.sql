-- The session gate (D-028, D-030) covers every table: a meta-test that fails
-- when a table in public with row-level security lacks the RESTRICTIVE
-- util.session_ok() policy, plus the gate in action on the group tables.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'audit_log'
      and not exists (
        select 1 from pg_policy p
         where p.polrelid = c.oid and not p.polpermissive
           and pg_get_expr(p.polqual, p.polrelid) like '%session_ok()%'
      )),
  null::text[],
  'Every public table (except the admin-only audit_log) has the restrictive session_ok() policy');

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null::text[],
  'Row-level security is on for every public table');

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
end;
$$;
create function pg_temp.as_session(uid uuid, sid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', aal)::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

select pg_temp.make_user('00000000-0000-7000-8000-000000000401', 'gate@example.test');
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('00000000-0000-7000-8000-00000000c401', '00000000-0000-7000-8000-000000000401', now(), now(), 'aal1');

select pg_temp.as_session('00000000-0000-7000-8000-000000000401', '00000000-0000-7000-8000-00000000c401', 'aal1');
select set_config('test.g', public.create_group('Gatekeepers', null, 'ongoing', null, current_date, 'UTC', 50,
                  'invite_only', 'We keep watch together.', 'checkin_only', true, 'checkin_only')::text, true);
select is((select count(*) from public.groups), 1::bigint, 'A live session sees its group');

-- Two-step sign-in turned on: an aal1 session now sees and does nothing.
select pg_temp.as_postgres();
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-7000-8000-00000000f401', '00000000-0000-7000-8000-000000000401', 'app', 'totp', 'verified',
        now(), now());
select pg_temp.as_session('00000000-0000-7000-8000-000000000401', '00000000-0000-7000-8000-00000000c401', 'aal1');
select is((select count(*) from public.groups) + (select count(*) from public.group_members), 0::bigint,
  'Before the code is entered, no group rows are visible');
select throws_ok($$ select public.archive_group(current_setting('test.g')::uuid) $$, '42501', 'not_signed_in',
  '... and no group function runs');
select throws_ok($$ select public.create_group('Another', null, 'ongoing', null, current_date, 'UTC', 50,
                   'invite_only', 'We keep watch together.', 'checkin_only', true, 'checkin_only') $$,
  '42501', 'not_signed_in', '... not even creating a group');
select pg_temp.as_session('00000000-0000-7000-8000-000000000401', '00000000-0000-7000-8000-00000000c401', 'aal2');
select is((select count(*) from public.groups), 1::bigint, 'At aal2 the group is back');

-- Signed out from another device: the session row is gone.
select pg_temp.as_postgres();
delete from auth.sessions where id = '00000000-0000-7000-8000-00000000c401';
select pg_temp.as_session('00000000-0000-7000-8000-000000000401', '00000000-0000-7000-8000-00000000c401', 'aal2');
select is((select count(*) from public.groups), 0::bigint, 'A signed-out session sees no groups');
select throws_ok($$ select * from public.group_invite_details(repeat('0', 64)) $$, '42501', 'not_signed_in',
  '... and cannot look at invites as a member');

select * from finish();
rollback;
