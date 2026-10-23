-- Recovery tools (CLAUDE.md §7.9, D-106 to D-108): the waves-ridden-out
-- tally only counts up and only its owner reads it; a number for partners
-- reaches active partners only (still encrypted), never strangers, pending
-- or ended partners, or across a block; journal entries are readable only by
-- their author, are stored as ciphertext, can't be written straight into the
-- table, and are never audited (D-099). Every write is throttled.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'UTC', created_at = now() - interval '60 days' where profiles.id = make_user.id;
end;
$$;
create function pg_temp.as_user(id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select set_config('role', 'anon', true);
$$;
create function pg_temp.set(k text, v text) returns void language sql as $$ select set_config('test.' || k, v, true) $$;
create function pg_temp.get(k text) returns uuid language sql as $$ select current_setting('test.' || k)::uuid $$;
create function pg_temp.add_member(gid uuid, uid uuid) returns void language sql as $$
  insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
  values (gid, uid, 'member', 'active', 'full', now(), now());
$$;
create function pg_temp.tries(p_sql text, n integer) returns integer language plpgsql as $$
declare i integer; ok integer := 0;
begin
  for i in 1..n loop
    begin
      execute p_sql;
      ok := ok + 1;
    exception when others then
      null;
    end;
  end loop;
  return ok;
end;
$$;

\set a '''00000000-0000-7000-8000-000000010001'''
\set b '''00000000-0000-7000-8000-000000010002'''
\set c '''00000000-0000-7000-8000-000000010003'''
\set d '''00000000-0000-7000-8000-000000010004'''
select pg_temp.make_user(:a, 'rt-a@example.test');
select pg_temp.make_user(:b, 'rt-partner@example.test');
select pg_temp.make_user(:c, 'rt-member@example.test');
select pg_temp.make_user(:d, 'rt-pending@example.test');

select pg_temp.as_user(:a);
select pg_temp.set('g', public.create_group('Recovery group', null, 'ongoing', null, current_date, 'UTC', 50,
                    'invite_only', 'A covenant.', 'checkin_only', true, 'full')::text);
select pg_temp.as_postgres();
select pg_temp.add_member(pg_temp.get('g'), :b);
select pg_temp.add_member(pg_temp.get('g'), :c);
select pg_temp.add_member(pg_temp.get('g'), :d);

-- a and b are active partners; a has asked d, who hasn't answered.
select pg_temp.as_user(:a);
select pg_temp.set('pb', public.request_partner(pg_temp.get('g'), :b)::text);
select public.request_partner(pg_temp.get('g'), :d);
select pg_temp.as_user(:b);
select public.respond_partner(pg_temp.get('pb'), true);

-- ---------------------------------------------------------------- waves ridden out

select pg_temp.as_user(:a);
select is(public.count_wave(), 1, 'The first wave counts one');
select is(public.count_wave(), 2, '... and the tally only counts up');
select results_eq($$ select waves from public.recovery_tallies $$, array[2], 'I read my own tally');
select is((select count(*)::int from information_schema.columns
            where table_schema = 'public' and table_name = 'recovery_tallies'), 3,
  'Only a number is kept: no dates of hard moments, no failures');
select throws_ok($$ insert into public.recovery_tallies (user_id, waves) values (auth.uid(), 99) $$,
  '42501', null, 'Nobody writes the tally directly');
select throws_ok($$ update public.recovery_tallies set waves = 0 $$, '42501', null, '... or resets it');
select pg_temp.as_user(:b);
select is((select count(*)::int from public.recovery_tallies), 0, 'Even a partner never sees my tally');
select pg_temp.as_anon();
select throws_ok($$ select public.count_wave() $$, '42501', null, 'Signed out, nothing counts');
select pg_temp.as_user(:c);
select is(pg_temp.tries('select public.count_wave()', 35), 30, 'The tally is throttled (30 an hour)');

-- ---------------------------------------------------------------- a number partners can call

select pg_temp.as_user(:b);
select lives_ok($$ select public.set_partner_contact('v1:aaa:bbb:ccc') $$, 'My partner shares a number (encrypted by the app)');
select throws_ok($$ select public.set_partner_contact('+91 98765 43210') $$, '22023', 'invalid_input',
  'A plain number is refused: only ciphertext is stored');
select throws_ok($$ insert into public.partner_contacts (user_id, phone_encrypted) values (auth.uid(), 'v1:x') $$,
  '42501', null, 'Nobody writes the table directly');
select pg_temp.as_user(:d);
select lives_ok($$ select public.set_partner_contact('v1:ddd:eee:fff') $$, 'Someone I asked (not yet a partner) shares one');

select pg_temp.as_user(:a);
select results_eq($$ select partner_id, phone_encrypted from public.partner_contacts_for_me() $$,
  $$ values ('00000000-0000-7000-8000-000000010002'::uuid, 'v1:aaa:bbb:ccc'::text) $$,
  'I get my active partner''s number, still encrypted, and not a pending one''s');
select is((select count(*)::int from public.partner_contacts), 0, 'I can''t read the table for anyone but me');
select pg_temp.as_user(:c);
select is((select count(*)::int from public.partner_contacts_for_me()), 0, 'A member who isn''t a partner gets nothing');

-- A block hides it, and so does the partnership ending.
select pg_temp.as_user(:b);
select public.block_member(:a);
select pg_temp.as_user(:a);
select is((select count(*)::int from public.partner_contacts_for_me()), 0, 'Across a block, no number');
select pg_temp.as_user(:b);
select lives_ok($$ select public.set_partner_contact(null) $$, 'Removing my number');
select pg_temp.as_postgres();
select is((select count(*)::int from public.partner_contacts where user_id = :b), 0, '... deletes it');

-- ---------------------------------------------------------------- the journal

select pg_temp.as_user(:a);
select pg_temp.set('e1', '0199a000-0000-7000-8000-000000010101');
select lives_ok(format($$ select public.save_journal_entry(%L, 'p03', 'v1:iv:tag:secret', true) $$, pg_temp.get('e1')),
  'I write an entry (ciphertext from the app)');
select results_eq($$ select prompt_key, body_encrypted from public.journal_entries $$,
  $$ values ('p03'::text, 'v1:iv:tag:secret'::text) $$, 'I read my own entry');
select throws_ok(format($$ select public.save_journal_entry(%L, null, 'Dear diary', false) $$, pg_temp.get('e1')),
  '22023', 'invalid_input', 'Plain text is never stored');
select throws_ok($$ insert into public.journal_entries (user_id, body_encrypted) values (auth.uid(), 'v1:x') $$,
  '42501', null, 'Nobody writes the table directly');
select pg_temp.as_postgres();
select is((select count(*)::int from public.audit_log where actor_id = :a and action like 'journal%'), 0,
  'Journal entries are never audited (D-099)');

select pg_temp.as_user(:c);
select is((select count(*)::int from public.journal_entries), 0, 'Nobody else reads my journal, not even a group admin');
select throws_ok(format($$ select public.save_journal_entry(%L, null, 'v1:x:y:z', false) $$, pg_temp.get('e1')),
  '42501', 'entry_not_found', '... or changes it');
select throws_ok(format($$ select public.delete_journal_entry(%L) $$, pg_temp.get('e1')),
  '42501', 'entry_not_found', '... or deletes it');
select pg_temp.as_anon();
select throws_ok($$ select count(*) from public.journal_entries $$, '42501', null, 'Signed out, nothing at all');

select pg_temp.as_user(:a);
select lives_ok(format($$ select public.delete_journal_entry(%L) $$, pg_temp.get('e1')), 'I delete my entry');
select is((select count(*)::int from public.journal_entries), 0, '... and it is gone');

select * from finish();
rollback;
