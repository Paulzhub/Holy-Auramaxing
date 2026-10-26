-- recovery: devotionals, the verse of the day and the reading plans
-- (CLAUDE.md §7.9). Phase 8b; see D-112.
--
-- Content (plans, their days and the 366 verses of the day) is published
-- content: everyone may read it, the anonymous role included (§6). It is
-- seeded by 20261027000200_recovery_devotionals_text.sql, generated from the
-- data files by scripts/build-devotionals.mjs.
--
-- Progress (which days someone has read, and which plan they're on) is read
-- only by its owner and written only through the functions below. Reading
-- isn't audited: what someone reads, and when, is private.
--
-- XP: marking a plan day read queues a 'devotional' job with the key
-- plan:<slug>:<day>, so private.award_devotional gives +5 XP once ever for
-- that day, however often it is unmarked, read again or the plan restarted
-- (owner, 2026-10-26). XP only; levels come from check-ins alone (D-071).
-- The ledger's source keys are unique across everyone, so the award's key
-- now carries the person too (devotional:<user>:<key>, like
-- checkin:<user>:<date>); nothing called it before this phase.
--
-- Retention: progress and the active plan are kept until the account is
-- deleted (they go with the profile, on delete cascade). They are the
-- person's own record, say only which days were read, are never shown to
-- anyone else, and the reading page needs them to say "Day 4 of 30". Both are
-- in the data export.

-- ---------------------------------------------------------------- content

create table public.devotional_plans (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,30}$'),
  length integer not null check (length between 1 and 366),
  title_key text not null check (title_key ~ '^[a-z0-9]{1,20}$'),
  sort integer not null
);

comment on table public.devotional_plans is
  'Reading plans (§7.9, D-112). Published content; seeded from data/reading_plans.json.';

create table public.devotionals (
  plan text not null references public.devotional_plans (slug) on delete cascade,
  day integer not null check (day >= 1),
  refs text[] not null check (cardinality(refs) >= 1),
  passages jsonb not null check (jsonb_typeof(passages) = 'array'),
  primary key (plan, day)
);

comment on table public.devotionals is
  'One day of a reading plan: its chapter references (refs, for the day list) and their World English Bible text, as [{ref, verses: [[n, text]]}] (D-112).';

create table public.verses_of_day (
  day_of_year integer primary key check (day_of_year between 1 and 366),
  reference text not null,
  verse_text text not null
);

comment on table public.verses_of_day is
  'The verse of the day, by day of a leap year (29 February is day 60; other years skip it). Seeded from data/verses_of_day.csv.';

do $$
declare
  t text;
begin
  foreach t in array array['devotional_plans', 'devotionals', 'verses_of_day'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to anon, authenticated', t);
    execute format('create policy "%s: published" on public.%I for select to anon, authenticated using (true)', t, t);
    -- Signed-in readers still need a live, verified session (D-028), like level_tiers.
    execute format(
      'create policy "%s: live, verified session" on public.%I as restrictive for all to authenticated '
      'using ((select util.session_ok())) with check ((select util.session_ok()))',
      t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- progress

create table public.devotional_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null,
  day integer not null,
  read_at timestamptz not null default now(),
  primary key (user_id, plan, day),
  foreign key (plan, day) references public.devotionals (plan, day) on delete cascade
);

comment on table public.devotional_progress is
  'Plan days a person has read (§7.9, D-112). Owner only; written by mark_day_read/unmark_day_read; kept until the account is deleted.';

create table public.devotional_active_plan (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null references public.devotional_plans (slug) on delete cascade,
  started_on date not null
);

comment on table public.devotional_active_plan is
  'The plan a person is reading now (D-112). Owner only; written by start_reading_plan; kept until the account is deleted.';

do $$
declare
  t text;
begin
  foreach t in array array['devotional_progress', 'devotional_active_plan'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format(
      'create policy "%s: owner reads" on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t, t);
    execute format(
      'create policy "%s: live, verified session" on public.%I as restrictive for all to authenticated '
      'using ((select util.session_ok())) with check ((select util.session_ok()))',
      t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- XP

create or replace function private.award_devotional(p_user uuid, p_key text, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from public.profiles where id = p_user;
  if v_tz is null or p_key is null then
    return;
  end if;
  insert into public.xp_ledger (user_id, local_date, reason, points, source_key, revision)
  select p_user, (p_at at time zone v_tz)::date, 'devotional', c.points, 'devotional:' || p_user || ':' || p_key, 1
    from public.xp_config c where c.key = 'devotional' and c.points > 0
  on conflict (source_key, revision) do nothing;
end;
$$;

revoke all on function private.award_devotional(uuid, text, timestamptz) from public;

-- ---------------------------------------------------------------- writes

-- Start (or switch to) a plan. Progress in every plan is kept, so switching
-- back picks up where the person left off.
create or replace function public.start_reading_plan(p_plan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  v_tz text;
begin
  if not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'reading_write', 60, interval '1 hour');
  if not exists (select 1 from public.devotional_plans where slug = p_plan) then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;
  select timezone into v_tz from public.profiles where id = v_uid;
  insert into public.devotional_active_plan as a (user_id, plan, started_on)
  values (v_uid, p_plan, (now() at time zone coalesce(v_tz, 'UTC'))::date)
  on conflict (user_id) do update
    set plan = excluded.plan,
        started_on = case when a.plan = excluded.plan then a.started_on else excluded.started_on end;
end;
$$;

revoke all on function public.start_reading_plan(text) from public, anon;
grant execute on function public.start_reading_plan(text) to authenticated;

-- Mark a plan day read. Returns true when it wasn't marked before. The XP
-- job is idempotent (one source_key per plan day), so reading a day again
-- never pays twice.
create or replace function public.mark_day_read(p_plan text, p_day integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  v_new boolean;
begin
  if not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'reading_write', 60, interval '1 hour');
  if not exists (select 1 from public.devotionals where plan = p_plan and day = p_day) then
    raise exception 'unknown_day' using errcode = '22023';
  end if;
  insert into public.devotional_progress (user_id, plan, day)
  values (v_uid, p_plan, p_day)
  on conflict do nothing;
  v_new := found;
  if v_new then
    perform private.enqueue('devotional', jsonb_build_object(
      'user', v_uid, 'key', 'plan:' || p_plan || ':' || p_day, 'at', now()));
  end if;
  return v_new;
end;
$$;

revoke all on function public.mark_day_read(text, integer) from public, anon;
grant execute on function public.mark_day_read(text, integer) to authenticated;

-- Unmark a day (a mistaken tap). The XP already given stays: it was given for
-- reading, and taking it back would only make marking feel risky.
create or replace function public.unmark_day_read(p_plan text, p_day integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'reading_write', 60, interval '1 hour');
  delete from public.devotional_progress where user_id = v_uid and plan = p_plan and day = p_day;
end;
$$;

revoke all on function public.unmark_day_read(text, integer) from public, anon;
grant execute on function public.unmark_day_read(text, integer) to authenticated;
