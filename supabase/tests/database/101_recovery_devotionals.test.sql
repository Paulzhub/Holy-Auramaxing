-- Devotionals (CLAUDE.md §7.9, D-112): plans, their days and the verses of
-- the day are published content anyone may read (the anonymous role too);
-- reading progress and the active plan are read only by their owner and
-- written only through the functions; a plan day earns +5 XP once ever, never
-- twice (unmarked and read again, or the plan restarted), and never touches
-- the level. Every write is throttled, and nothing is audited.
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
create function pg_temp.devotional_xp(uid uuid) returns integer language sql as $$
  select coalesce(sum(points), 0)::integer from public.xp_ledger where user_id = uid and reason = 'devotional';
$$;

\set a '''00000000-0000-7000-8000-000000011001'''
\set b '''00000000-0000-7000-8000-000000011002'''
\set c '''00000000-0000-7000-8000-000000011003'''
select pg_temp.make_user(:a, 'dv-a@example.test');
select pg_temp.make_user(:b, 'dv-b@example.test');
select pg_temp.make_user(:c, 'dv-c@example.test');
select set_config('test.audits', (select count(*) from public.audit_log)::text, true);

-- ---------------------------------------------------------------- published content

select pg_temp.as_anon();
select is((select count(*)::integer from public.verses_of_day), 366, 'anyone may read the 366 verses of the day');
select is((select string_agg(slug || ':' || length, ',' order by sort) from public.devotional_plans),
          '7-days:7,30-days:30,90-days:90', 'the three plans are published, with neutral slugs');
select is((select count(*)::integer from public.devotionals where plan = '90-days'), 90,
          'every day of a plan is readable');
select is((select passages -> 0 ->> 'ref' from public.devotionals where plan = '7-days' and day = 5), 'Psalm 51',
          'day 5 of the seven-day plan is Psalm 51');
select throws_ok($$select count(*) from public.devotional_progress$$, '42501', null,
                 'the anonymous role can''t read progress at all');
select throws_ok($$select public.mark_day_read('7-days', 1)$$, '42501', null,
                 'the anonymous role can''t mark a day read');

-- ---------------------------------------------------------------- writes go through the functions

select pg_temp.as_user(:a);
select throws_ok($$insert into public.devotional_progress (user_id, plan, day)
                   values ('00000000-0000-7000-8000-000000011001', '7-days', 1)$$, '42501', null,
                 'progress can''t be written straight into the table');
select throws_ok($$update public.verses_of_day set verse_text = 'x' where day_of_year = 1$$, '42501', null,
                 'published content can''t be changed by a member');
select throws_ok($$select public.mark_day_read('7-days', 8)$$, '22023', null, 'a day the plan doesn''t have is refused');
select throws_ok($$select public.start_reading_plan('nope')$$, '22023', null, 'an unknown plan is refused');

select lives_ok($$select public.start_reading_plan('30-days')$$, 'a member starts a plan');
select is((select plan from public.devotional_active_plan where user_id = :a), '30-days', 'it becomes their plan');
select is(public.mark_day_read('30-days', 1), true, 'marking a new day says so');
select is(public.mark_day_read('30-days', 1), false, 'marking it again changes nothing');

-- ---------------------------------------------------------------- XP once, never twice, never levels

select pg_temp.as_postgres();
select private.run_jobs(1000, true);
select is(pg_temp.devotional_xp(:a), 5, 'a plan day read earns +5 XP');
select is((select xp from public.user_stats where user_id = :a), 5, 'and it shows in their XP');

select pg_temp.as_user(:a);
select public.unmark_day_read('30-days', 1);
select is((select count(*)::integer from public.devotional_progress where user_id = :a), 0, 'a day can be unmarked');
select is(public.mark_day_read('30-days', 1), true, 'and marked again');
select public.start_reading_plan('7-days');
select public.start_reading_plan('30-days');
select pg_temp.as_postgres();
select private.run_jobs(1000, true);
select is(pg_temp.devotional_xp(:a), 5, 'reading the same plan day again never pays twice, even after a restart');

select pg_temp.as_user(:a);
select public.mark_day_read('30-days', 2);
select public.mark_day_read('7-days', 1);
select pg_temp.as_postgres();
select private.run_jobs(1000, true);
select is(pg_temp.devotional_xp(:a), 15, 'each different plan day pays once');
select is((select (level, level_progress_days, highest_level)::text from public.user_stats where user_id = :a),
          '(0,0,0)', 'reading never changes the level');

-- ---------------------------------------------------------------- owner only

select pg_temp.as_user(:b);
select is((select count(*)::integer from public.devotional_progress), 0, 'nobody else sees my progress');
select is((select count(*)::integer from public.devotional_active_plan), 0, 'nor which plan I''m on');
select public.mark_day_read('7-days', 3);
select is((select count(*)::integer from public.devotional_progress), 1, 'they see only their own');
select public.mark_day_read('30-days', 1);
select pg_temp.as_postgres();
select private.run_jobs(1000, true);
select is(pg_temp.devotional_xp(:b), 10, 'someone else reading the same plan day earns their own XP');
select pg_temp.as_user(:b);
select lives_ok($$select public.unmark_day_read('30-days', 2)$$, 'unmarking someone else''s day does nothing');
select pg_temp.as_postgres();
select is((select count(*)::integer from public.devotional_progress where user_id = :a), 3,
          'another person can''t unmark my days');

-- ---------------------------------------------------------------- throttled, never audited

select pg_temp.as_user(:c);
select is(pg_temp.tries($$select public.mark_day_read('90-days', 1)$$, 70), 60,
          'reading writes are throttled at 60 an hour');
select pg_temp.as_postgres();
select is((select count(*)::integer from public.audit_log), current_setting('test.audits')::integer,
          'reading is never audited');

-- ---------------------------------------------------------------- account deletion

delete from auth.users where id = :b;
select is((select count(*)::integer from public.devotional_progress where user_id = :b), 0,
          'progress goes with the account');

select * from finish();
rollback;
