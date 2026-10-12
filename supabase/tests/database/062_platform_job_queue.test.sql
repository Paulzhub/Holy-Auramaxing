-- The job queue (CLAUDE.md §5, §14, D-070): pgmq queues reachable only by
-- the database itself; a worker on pg_cron every 10 seconds; one failing job
-- never undoes the others; after five failures a job moves to jobs_dead; a
-- saved check-in queues its own work; erasing an account clears its jobs.
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

create function pg_temp.make_user(id uuid, email text) returns void language plpgsql as $$
declare token text := 'token-' || replace(id::text, '-', '');
begin
  perform public.create_signup_ticket(encode(extensions.digest(token, 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('signup_ticket', token), now(), now());
  update public.profiles set timezone = 'Asia/Kolkata' where profiles.id = make_user.id;
end;
$$;
-- Jobs of this test (other rows may be waiting from elsewhere).
create function pg_temp.waiting(marker text) returns bigint language sql as $$
  select count(*) from pgmq.q_jobs where message ->> 'test' = marker
$$;
create function pg_temp.dead(marker text) returns bigint language sql as $$
  select count(*) from pgmq.q_jobs_dead where message ->> 'test' = marker
$$;
-- Makes every waiting job visible again (as if 60 seconds had passed).
create function pg_temp.time_passes() returns void language sql as $$
  update pgmq.q_jobs set vt = now() - interval '1 second';
$$;

\set a '''00000000-0000-7000-8000-000000006201'''
\set b '''00000000-0000-7000-8000-000000006202'''
select pg_temp.make_user(:a, 'queue-a@example.test');
select pg_temp.make_user(:b, 'queue-b@example.test');

-- ---------------------------------------------------------------- set-up

select has_extension('pgmq', 'pgmq is installed');
select has_table('pgmq', 'q_jobs', 'The jobs queue exists');
select has_table('pgmq', 'q_jobs_dead', 'The dead-letter queue exists');
select is((select schedule from cron.job where jobname = 'jobs-worker'), '10 seconds',
  'The worker runs every 10 seconds');
select is((select command from cron.job where jobname = 'jobs-worker'), 'select private.run_jobs()',
  '… running private.run_jobs()');
select is((select schedule from cron.job where jobname = 'challenge-endings-hourly'), '23 * * * *',
  'Finished challenges are looked for hourly');

select ok(not has_schema_privilege('authenticated', 'pgmq', 'usage'), 'Signed-in people can''t reach the queues');
select ok(not has_schema_privilege('anon', 'pgmq', 'usage'), 'Visitors can''t either');
select ok(not has_table_privilege('authenticated', 'pgmq.q_jobs', 'select'), 'Nor read a queue''s rows');
select ok(not has_function_privilege('authenticated', 'private.run_jobs(integer, boolean)', 'execute'),
  'Nor run the worker');

-- ---------------------------------------------------------------- a check-in queues its work

insert into public.checkins (user_id, local_date, timezone, outcome) values (:a, current_date, 'Asia/Kolkata', 'slipped');
select is((select count(*) from pgmq.q_jobs where message ->> 'type' = 'user_settle' and message ->> 'user' = :a),
  1::bigint, 'Saving a check-in queues one job for that person');
select ok((select (message - 'type' - 'user' - 'from') = '{}'::jsonb from pgmq.q_jobs
            where message ->> 'user' = :a limit 1),
  'The job holds ids and a date only, never the answer');

-- ---------------------------------------------------------------- failures and the dead-letter queue

select pgmq.send('jobs', '{"type":"no_such_job","test":"bad"}');
select pgmq.send('jobs', '{"type":"group_stats","test":"bad-payload","group":"not-a-uuid"}');
select pgmq.send('jobs', jsonb_build_object('type', 'user_settle', 'user', :b, 'test', 'good'));
select private.run_jobs(1000, true);
select is(pg_temp.waiting('good'), 0::bigint, 'A good job next to bad ones still runs (each has its own sub-transaction)');
select is(pg_temp.waiting('bad') + pg_temp.waiting('bad-payload'), 2::bigint, 'Failed jobs stay on the queue to retry');
select pg_temp.time_passes();
select private.run_jobs(1000, true);
select pg_temp.time_passes();
select private.run_jobs(1000, true);
select pg_temp.time_passes();
select private.run_jobs(1000, true);
select is(pg_temp.dead('bad'), 0::bigint, 'Four tries: still retrying');
select pg_temp.time_passes();
select private.run_jobs(1000, true);
select is(pg_temp.waiting('bad') + pg_temp.dead('bad') * 10 + pg_temp.waiting('bad-payload') + pg_temp.dead('bad-payload') * 10,
  20::bigint, 'On the fifth failure both move to jobs_dead');
select is((select message ->> 'error' from pgmq.q_jobs_dead where message ->> 'test' = 'bad'), 'job_unknown_type',
  'The dead letter keeps the error code');

-- Dead letters are kept 30 days.
update pgmq.q_jobs_dead set enqueued_at = now() - interval '31 days' where message ->> 'test' = 'bad';
select private.queue_challenge_endings();
select is(pg_temp.dead('bad'), 0::bigint, 'Dead letters older than 30 days are removed');

-- ---------------------------------------------------------------- erasure

select pgmq.send('jobs_dead', jsonb_build_object('type', 'user_settle', 'user', :b, 'test', 'erase'));
select private.enqueue('user_settle', jsonb_build_object('user', :b));
delete from auth.users where id = :b;
select is((select count(*) from pgmq.q_jobs where message ->> 'user' = :b)
          + (select count(*) from pgmq.q_jobs_dead where message ->> 'user' = :b), 0::bigint,
  'Erasing an account clears its jobs and dead letters');

select * from finish();
rollback;
