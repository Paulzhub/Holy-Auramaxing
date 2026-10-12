-- gamification: XP, badges and the job queue (CLAUDE.md §7.6, §5, §14).
-- See D-070 to D-073.
--
-- Slow or fan-out work goes through a queue (§5): a saved check-in no longer
-- recalculates XP, badges or group stats in the request. A trigger puts a
-- job on the `jobs` queue (pgmq) and a worker, run by pg_cron every 10
-- seconds, does the work.
--
-- Every job is idempotent: it works out what the ledger *should* say and
-- writes only the difference, so running a job twice (or ten times) never
-- awards XP twice. A job that keeps failing moves to `jobs_dead` after five
-- tries (§14: retries and a dead-letter queue).
--
-- XP (D-071): one append-only ledger. Each award has a source key (for
-- example `checkin:<user>:<date>`) and a revision; (source_key, revision) is
-- unique. When an earlier answer changes what a source is worth (a late
-- offline check-in joins two runs of check-ins, so later days' bonuses grow),
-- the job writes a reversal row (minus what was paid) and a new award. A slip
-- earns exactly what a free day earns (§2.2, D-069).
--
-- Badges (D-072): awarded once, kept for good, even if an edit later lowers
-- the streak that earned them.

create extension if not exists pgmq;

-- Nobody but the database itself touches the queues (the Data API doesn't
-- expose the schema either; this is the second lock).
revoke all on schema pgmq from public, anon, authenticated;
revoke all on all tables in schema pgmq from public, anon, authenticated;
revoke all on all functions in schema pgmq from public, anon, authenticated;
revoke all on all sequences in schema pgmq from public, anon, authenticated;

select pgmq.create('jobs');
select pgmq.create('jobs_dead');

revoke all on all tables in schema pgmq from public, anon, authenticated;
revoke all on all sequences in schema pgmq from public, anon, authenticated;

-- ---------------------------------------------------------------- XP config

create table public.xp_config (
  key text primary key,
  points integer not null check (points >= 0),
  -- The most this source can give in a day (or per award, for the bonus).
  cap integer check (cap is null or cap >= 0),
  description text not null
);

comment on table public.xp_config is
  'XP values (§7.6), tunable with a migration. New values apply to days settled from then on; history is not rewritten.';

insert into public.xp_config (key, points, cap, description) values
  ('checkin', 10, null, 'Any honest check-in, free or slipped (§2.2, D-069).'),
  ('checkin_streak_bonus', 2, 20, 'Per day of the check-in streak, from day 1, up to the cap (owner, 2026-10-12).'),
  ('encouragement', 1, 10, 'A reaction, nudge or comment for someone else; the cap is per local day (Phase 6).'),
  ('devotional', 5, null, 'A devotional day read (Phase 8).'),
  ('challenge_finished', 100, null, 'Active in a group on its challenge''s last day.');

-- ---------------------------------------------------------------- XP ledger

create table public.xp_ledger (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Set for XP that belongs to one group (finishing its challenge,
  -- encouraging someone there). Check-in XP belongs to no group.
  group_id uuid references public.groups (id) on delete set null,
  -- The day the XP is for, in the person's own time zone.
  local_date date not null,
  reason text not null
    check (reason in ('checkin', 'checkin_streak', 'encouragement', 'devotional', 'challenge_finished')),
  kind text not null default 'award' check (kind in ('award', 'reversal')),
  points integer not null check (points <> 0),
  source_key text not null check (char_length(source_key) between 3 and 200),
  revision integer not null check (revision >= 1),
  created_at timestamptz not null default now(),
  unique (source_key, revision)
);

comment on table public.xp_ledger is
  'Append-only XP (§7.6, D-071). Corrections are reversal rows, never edits. Owner-only.';

create index xp_ledger_user_date_idx on public.xp_ledger (user_id, local_date);
create index xp_ledger_group_date_idx on public.xp_ledger (group_id, local_date) where group_id is not null;

-- Append-only: rows are never changed or removed, except that a deleted
-- group's id is cleared (the XP stays with the person) and erasing an account
-- removes its rows (the profile is already gone by then).
create or replace function private.xp_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.group_id is null and old.group_id is not null
       and (new.id, new.user_id, new.local_date, new.reason, new.kind, new.points, new.source_key, new.revision,
            new.created_at)
           is not distinct from
           (old.id, old.user_id, old.local_date, old.reason, old.kind, old.points, old.source_key, old.revision,
            old.created_at) then
      return new;
    end if;
    raise exception 'xp_ledger_append_only';
  end if;
  if exists (select 1 from public.profiles p where p.id = old.user_id) then
    raise exception 'xp_ledger_append_only';
  end if;
  return old;
end;
$$;

create trigger xp_ledger_append_only
  before update or delete on public.xp_ledger
  for each row execute function private.xp_ledger_append_only();

revoke all on function private.xp_ledger_append_only() from public;

-- ---------------------------------------------------------------- totals

alter table public.user_stats
  add column xp integer not null default 0;

alter table public.group_member_stats
  add column xp_in_group integer not null default 0;

comment on column public.user_stats.xp is 'Sum of the person''s xp_ledger rows, kept by the jobs.';
comment on column public.group_member_stats.xp_in_group is
  'XP for this group: its own rows plus check-in XP for days inside the member''s challenge window.';

-- ---------------------------------------------------------------- badges

create table public.badges (
  slug text primary key check (slug ~ '^[a-z0-9_]{2,40}$'),
  kind text not null check (kind in ('free_days', 'checkin_days', 'finisher', 'encourager', 'prayer', 'testimony')),
  -- Days in a row for free_days and checkin_days; null for the others.
  threshold integer check (threshold is null or threshold > 0),
  -- A Lucide icon name; the app maps it to the icon.
  icon text not null check (icon ~ '^[a-z-]{2,40}$'),
  reference text not null,
  -- World English Bible (public domain), from data/badge_verses.json (D-072).
  verse_text text not null,
  sort integer not null unique,
  check ((kind in ('free_days', 'checkin_days')) = (threshold is not null))
);

comment on table public.badges is
  'Badges (§7.6, D-072). Names and descriptions live in the app''s messages, keyed by slug.';

insert into public.badges (slug, kind, threshold, icon, reference, verse_text, sort) values
  ('free_1', 'free_days', 1, 'sunrise', 'Lamentations 3:22',
   'It is because of Yahweh’s loving kindnesses that we are not consumed, because his compassion doesn’t fail.', 10),
  ('free_3', 'free_days', 3, 'sprout', 'Hosea 6:2',
   'After two days he will revive us. On the third day he will raise us up, and we will live before him.', 20),
  ('free_7', 'free_days', 7, 'armchair', 'Genesis 2:2',
   'On the seventh day God finished his work which he had done; and he rested on the seventh day from all his work which he had done.', 30),
  ('free_14', 'free_days', 14, 'footprints', 'Psalm 121:8',
   'Yahweh will keep your going out and your coming in, from this time forward, and forever more.', 40),
  ('free_21', 'free_days', 21, 'tree-deciduous', 'Colossians 2:7',
   'rooted and built up in him, and established in the faith, even as you were taught, abounding in it in thanksgiving.', 50),
  ('free_30', 'free_days', 30, 'sun', 'Lamentations 3:23',
   'They are new every morning. Great is your faithfulness.', 60),
  ('free_40', 'free_days', 40, 'mountain', 'Exodus 24:18',
   'Moses entered into the middle of the cloud, and went up on the mountain; and Moses was on the mountain forty days and forty nights.', 70),
  ('free_60', 'free_days', 60, 'anchor', '1 Corinthians 15:58',
   'Therefore, my beloved brothers, be steadfast, immovable, always abounding in the Lord’s work, because you know that your labor is not in vain in the Lord.', 80),
  ('free_90', 'free_days', 90, 'bird', 'Galatians 5:1',
   'Stand firm therefore in the liberty by which Christ has made us free, and don’t be entangled again with a yoke of bondage.', 90),
  ('free_180', 'free_days', 180, 'feather', 'Isaiah 40:31',
   'but those who wait for Yahweh will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.', 100),
  ('free_365', 'free_days', 365, 'crown', 'Psalm 65:11',
   'You crown the year with your bounty. Your carts overflow with abundance.', 110),
  ('checkin_7', 'checkin_days', 7, 'calendar-check', 'Luke 16:10',
   'He who is faithful in a very little is faithful also in much. He who is dishonest in a very little is also dishonest in much.', 200),
  ('checkin_30', 'checkin_days', 30, 'alarm-clock', 'Isaiah 50:4',
   'The Lord Yahweh has given me the tongue of those who are taught, that I may know how to sustain with words him who is weary. He awakens morning by morning, he awakens my ear to hear as those who are taught.', 210),
  ('checkin_100', 'checkin_days', 100, 'wheat', 'Matthew 6:11',
   'Give us today our daily bread.', 220),
  ('faithful_finisher', 'finisher', null, 'flag', '2 Timothy 4:7',
   'I have fought the good fight. I have finished the course. I have kept the faith.', 300),
  ('encourager', 'encourager', null, 'hand-heart', '1 Thessalonians 5:11',
   'Therefore exhort one another, and build each other up, even as you also do.', 310),
  ('prayer_warrior', 'prayer', null, 'hand-helping', 'James 5:16',
   'Confess your offenses to one another, and pray for one another, that you may be healed. The insistent prayer of a righteous person is powerfully effective.', 320),
  ('first_testimony', 'testimony', null, 'message-square-quote', 'Revelation 12:11',
   'They overcame him because of the Lamb’s blood, and because of the word of their testimony. They didn’t love their life, even to death.', 330);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null references public.badges (slug),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);

comment on table public.user_badges is
  'Badges earned (D-072). Kept for good: never removed except when the account is erased. Owner-only; groups see them through profile_cards at streak or full.';

create index user_badges_recent_idx on public.user_badges (user_id, earned_at desc);

create or replace function private.user_badges_kept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' or exists (select 1 from public.profiles p where p.id = old.user_id) then
    raise exception 'user_badges_kept';
  end if;
  return old;
end;
$$;

create trigger user_badges_kept
  before update or delete on public.user_badges
  for each row execute function private.user_badges_kept();

revoke all on function private.user_badges_kept() from public;

-- ---------------------------------------------------------------- RLS

alter table public.xp_config enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

revoke all on table public.xp_config from anon, authenticated;
revoke all on table public.xp_ledger from anon, authenticated;
revoke all on table public.badges from anon, authenticated;
revoke all on table public.user_badges from anon, authenticated;

grant select on table public.xp_config to authenticated;
grant select on table public.xp_ledger to authenticated;
grant select on table public.badges to authenticated;
grant select on table public.user_badges to authenticated;

create policy "xp_config: signed-in people read" on public.xp_config
  for select to authenticated using (true);
create policy "xp_ledger: owner reads" on public.xp_ledger
  for select to authenticated using (user_id = (select auth.uid()));
create policy "badges: signed-in people read" on public.badges
  for select to authenticated using (true);
create policy "user_badges: owner reads" on public.user_badges
  for select to authenticated using (user_id = (select auth.uid()));

create policy "xp_config: live, verified session" on public.xp_config
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "xp_ledger: live, verified session" on public.xp_ledger
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "badges: live, verified session" on public.badges
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "user_badges: live, verified session" on public.user_badges
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- ---------------------------------------------------------------- the queue

-- Puts a job on the queue. Payloads hold ids and dates only (no answers,
-- no notes), because a failed job's payload is kept for up to 30 days.
create or replace function private.enqueue(p_type text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_type not in ('user_settle', 'group_stats', 'challenge_finished', 'encouragement', 'devotional') then
    raise exception 'job_unknown_type';
  end if;
  perform pgmq.send('jobs', jsonb_build_object('type', p_type) || coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function private.enqueue(text, jsonb) from public;

-- One person's XP total, from the ledger.
create or replace function private.refresh_user_xp(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_stats as s (user_id, xp)
  select p_user, coalesce((select sum(x.points) from public.xp_ledger x where x.user_id = p_user), 0)::integer
   where exists (select 1 from public.profiles p where p.id = p_user)
  on conflict (user_id) do update set xp = excluded.xp
   where s.xp is distinct from excluded.xp;
end;
$$;

revoke all on function private.refresh_user_xp(uuid) from public;

-- Brings one source to the points it should be worth. Writes nothing when the
-- ledger already agrees, which is what makes every job safe to replay; when it
-- doesn't, a reversal row cancels what was paid and a new award follows.
create or replace function private.settle_xp_source(
  p_user uuid, p_group uuid, p_local_date date, p_reason text, p_source_key text, p_points integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_net integer;
  v_rev integer;
begin
  select coalesce(sum(x.points), 0)::integer, coalesce(max(x.revision), 0)
    into v_net, v_rev
    from public.xp_ledger x
   where x.source_key = p_source_key;
  if v_net = coalesce(p_points, 0) then
    return;
  end if;
  if v_net <> 0 then
    v_rev := v_rev + 1;
    insert into public.xp_ledger (user_id, group_id, local_date, reason, kind, points, source_key, revision)
    values (p_user, p_group, p_local_date, p_reason, 'reversal', -v_net, p_source_key, v_rev);
  end if;
  if coalesce(p_points, 0) <> 0 then
    v_rev := v_rev + 1;
    insert into public.xp_ledger (user_id, group_id, local_date, reason, kind, points, source_key, revision)
    values (p_user, p_group, p_local_date, p_reason, 'award', p_points, p_source_key, v_rev);
  end if;
end;
$$;

revoke all on function private.settle_xp_source(uuid, uuid, date, text, text, integer) from public;

-- Check-in XP for every day from p_from (all days when null): +10 for any
-- answer, plus the check-in streak bonus (2 a day of the streak, from day 1,
-- up to 20). Days before p_from are left as they were paid, so a change to
-- xp_config never rewrites history.
create or replace function private.settle_checkin_xp(p_user uuid, p_from date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkin integer;
  v_bonus integer;
  v_cap integer;
  r record;
begin
  select points into v_checkin from public.xp_config where key = 'checkin';
  select points, cap into v_bonus, v_cap from public.xp_config where key = 'checkin_streak_bonus';

  for r in
    with days as (
      select c.local_date as d from public.checkins c where c.user_id = p_user
    ),
    runs as (
      select d, d - (row_number() over (order by d))::integer as run from days
    ),
    streaks as (
      select d, row_number() over (partition by run order by d)::integer as n from runs
    ),
    wanted as (
      select 'checkin:' || p_user || ':' || s.d as k, s.d, 'checkin'::text as reason, v_checkin as pts
        from streaks s where p_from is null or s.d >= p_from
      union all
      select 'checkin_streak:' || p_user || ':' || s.d, s.d, 'checkin_streak', least(v_bonus * s.n, coalesce(v_cap, v_bonus * s.n))
        from streaks s where p_from is null or s.d >= p_from
    ),
    paid as (
      select x.source_key as k, min(x.local_date) as d, min(x.reason) as reason, sum(x.points)::integer as pts
        from public.xp_ledger x
       where x.user_id = p_user
         and x.reason in ('checkin', 'checkin_streak')
         and (p_from is null or x.local_date >= p_from)
       group by x.source_key
    )
    select coalesce(w.k, p.k) as k, coalesce(w.d, p.d) as d, coalesce(w.reason, p.reason) as reason,
           coalesce(w.pts, 0) as pts
      from wanted w
      full join paid p on p.k = w.k
     where coalesce(w.pts, 0) <> coalesce(p.pts, 0)
     order by 2, 3
  loop
    perform private.settle_xp_source(p_user, null, r.d, r.reason, r.k, r.pts);
  end loop;
end;
$$;

revoke all on function private.settle_checkin_xp(uuid, date) from public;

-- Badges for days in a row: free days (the longest run of free days) and
-- check-ins (the longest run of days with any answer), counted from the
-- check-ins themselves. Awarded once; never taken back.
create or replace function private.award_streak_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free integer;
  v_checkin integer;
begin
  select coalesce(max(n), 0) into v_free
    from (select count(*)::integer as n
            from (select c.local_date - (row_number() over (order by c.local_date))::integer as run
                    from public.checkins c where c.user_id = p_user and c.outcome = 'clean') x
           group by x.run) runs;
  select coalesce(max(n), 0) into v_checkin
    from (select count(*)::integer as n
            from (select c.local_date - (row_number() over (order by c.local_date))::integer as run
                    from public.checkins c where c.user_id = p_user) x
           group by x.run) runs;

  insert into public.user_badges (user_id, badge)
  select p_user, b.slug
    from public.badges b
   where (b.kind = 'free_days' and b.threshold <= v_free)
      or (b.kind = 'checkin_days' and b.threshold <= v_checkin)
  on conflict (user_id, badge) do nothing;
end;
$$;

revoke all on function private.award_streak_badges(uuid) from public;

-- Group stats (D-045, now on the queue): clean days, check-ins and XP inside
-- each group's challenge, counted from the later of its start and the day the
-- person joined (their own time zone), up to its end.
create or replace function private.refresh_group_stats(p_group uuid default null, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_group is null and p_user is null then
    raise exception 'refresh_group_stats needs a group or a person';
  end if;

  insert into public.group_member_stats as s
         (group_id, user_id, clean_days_in_challenge, checkins_in_challenge, xp_in_group)
  select w.group_id, w.user_id,
         (select count(*) from public.checkins c
           where c.user_id = w.user_id and c.outcome = 'clean'
             and c.local_date >= w.from_day and (w.to_day is null or c.local_date <= w.to_day))::integer,
         (select count(*) from public.checkins c
           where c.user_id = w.user_id
             and c.local_date >= w.from_day and (w.to_day is null or c.local_date <= w.to_day))::integer,
         (select coalesce(sum(x.points), 0) from public.xp_ledger x
           where x.user_id = w.user_id
             and (x.group_id = w.group_id
                  or (x.group_id is null and x.local_date >= w.from_day
                      and (w.to_day is null or x.local_date <= w.to_day))))::integer
    from (
      select m.group_id, m.user_id,
             greatest(g.start_date, (m.joined_at at time zone p.timezone)::date) as from_day,
             g.end_date as to_day
        from public.group_members m
        join public.groups g on g.id = m.group_id
        join public.profiles p on p.id = m.user_id
       where m.status = 'active'
         and (p_group is null or m.group_id = p_group)
         and (p_user is null or m.user_id = p_user)
    ) w
  on conflict (group_id, user_id) do update set
    clean_days_in_challenge = excluded.clean_days_in_challenge,
    checkins_in_challenge = excluded.checkins_in_challenge,
    xp_in_group = excluded.xp_in_group
   where (s.clean_days_in_challenge, s.checkins_in_challenge, s.xp_in_group)
         is distinct from (excluded.clean_days_in_challenge, excluded.checkins_in_challenge, excluded.xp_in_group);
end;
$$;

revoke all on function private.refresh_group_stats(uuid, uuid) from public;

-- Encouraging someone (Phase 6 queues it): +1, at most 10 a local day. The
-- event key makes it count once however often the job runs.
create or replace function private.award_encouragement(p_user uuid, p_key text, p_group uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_day date;
  v_points integer;
  v_cap integer;
  v_key text := 'encouragement:' || p_key;
begin
  select timezone into v_tz from public.profiles where id = p_user;
  if v_tz is null or p_key is null then
    return;
  end if;
  if exists (select 1 from public.xp_ledger x where x.source_key = v_key) then
    return;
  end if;
  v_day := (p_at at time zone v_tz)::date;
  select points, cap into v_points, v_cap from public.xp_config where key = 'encouragement';
  if v_cap is not null and (
    select coalesce(sum(x.points), 0) from public.xp_ledger x
     where x.user_id = p_user and x.reason = 'encouragement' and x.local_date = v_day
  ) + v_points > v_cap then
    return;
  end if;
  insert into public.xp_ledger (user_id, group_id, local_date, reason, points, source_key, revision)
  values (p_user, p_group, v_day, 'encouragement', v_points, v_key, 1)
  on conflict (source_key, revision) do nothing;
end;
$$;

revoke all on function private.award_encouragement(uuid, text, uuid, timestamptz) from public;

-- A devotional day read (Phase 8 queues it): +5, once per key.
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
  select p_user, (p_at at time zone v_tz)::date, 'devotional', c.points, 'devotional:' || p_key, 1
    from public.xp_config c where c.key = 'devotional' and c.points > 0
  on conflict (source_key, revision) do nothing;
end;
$$;

revoke all on function private.award_devotional(uuid, text, timestamptz) from public;

-- Finishing a challenge: everyone active in the group on its last day (they
-- joined by then, in their own time zone) gets +100 and Faithful Finisher, once.
create or replace function private.award_challenge_finished(p_group uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end date;
  v_points integer;
  r record;
begin
  select g.end_date into v_end from public.groups g where g.id = p_group;
  if v_end is null then
    return;
  end if;
  select points into v_points from public.xp_config where key = 'challenge_finished';
  for r in
    select m.user_id
      from public.group_members m
      join public.profiles p on p.id = m.user_id
     where m.group_id = p_group
       and m.status = 'active'
       and (m.joined_at at time zone p.timezone)::date <= v_end
       and p.deletion_requested_at is null
       and p.deleted_at is null
  loop
    if v_points > 0 then
      insert into public.xp_ledger (user_id, group_id, local_date, reason, points, source_key, revision)
      values (r.user_id, p_group, v_end, 'challenge_finished', v_points,
              'challenge_finished:' || p_group || ':' || r.user_id, 1)
      on conflict (source_key, revision) do nothing;
    end if;
    insert into public.user_badges (user_id, badge) values (r.user_id, 'faithful_finisher')
    on conflict (user_id, badge) do nothing;
    return next r.user_id;
  end loop;
end;
$$;

revoke all on function private.award_challenge_finished(uuid) from public;

-- One job. Raises on a bad payload so the worker counts the try.
create or replace function private.run_job(p_msg jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p_msg ->> 'type';
  v_user uuid := (p_msg ->> 'user')::uuid;
  v_group uuid := (p_msg ->> 'group')::uuid;
  v_member uuid;
begin
  -- One person (or group) at a time, whatever else is running.
  if v_user is not null then
    perform pg_advisory_xact_lock(hashtextextended('xp:' || v_user, 0));
  end if;

  case v_type
    when 'user_settle' then
      if not exists (select 1 from public.profiles where id = v_user) then
        return;
      end if;
      perform private.settle_checkin_xp(v_user, (p_msg ->> 'from')::date);
      perform private.award_streak_badges(v_user);
      perform private.refresh_user_xp(v_user);
      perform private.refresh_group_stats(null, v_user);
    when 'group_stats' then
      if v_group is null then
        raise exception 'job_bad_payload';
      end if;
      perform private.refresh_group_stats(v_group, v_user);
    when 'encouragement' then
      perform private.award_encouragement(v_user, p_msg ->> 'key', v_group,
                                          coalesce((p_msg ->> 'at')::timestamptz, now()));
      perform private.refresh_user_xp(v_user);
      if v_group is not null and exists (select 1 from public.groups where id = v_group) then
        perform private.refresh_group_stats(v_group, v_user);
      end if;
    when 'devotional' then
      perform private.award_devotional(v_user, p_msg ->> 'key', coalesce((p_msg ->> 'at')::timestamptz, now()));
      perform private.refresh_user_xp(v_user);
      perform private.refresh_group_stats(null, v_user);
    when 'challenge_finished' then
      if v_group is null then
        raise exception 'job_bad_payload';
      end if;
      for v_member in select * from private.award_challenge_finished(v_group) loop
        perform private.refresh_user_xp(v_member);
      end loop;
      perform private.refresh_group_stats(v_group, null);
    else
      raise exception 'job_unknown_type';
  end case;
end;
$$;

revoke all on function private.run_job(jsonb) from public;

-- The worker (pg_cron, every 10 seconds). Takes up to p_batch jobs; each runs
-- in its own sub-transaction, so one bad job never undoes the others. A job
-- that fails stays on the queue and comes back after 60 seconds; on its fifth
-- failure it moves to jobs_dead with the error code. Only one worker runs at
-- a time (pass p_wait in tests to wait for it instead of skipping).
create or replace function private.run_jobs(p_batch integer default 200, p_wait boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_done integer := 0;
  v_state text;
  v_text text;
  v_started timestamptz := clock_timestamp();
begin
  if p_wait then
    perform pg_advisory_xact_lock(hashtextextended('private.run_jobs', 0));
  elsif not pg_try_advisory_xact_lock(hashtextextended('private.run_jobs', 0)) then
    return 0;
  end if;

  for m in select * from pgmq.read('jobs', 60, p_batch) loop
    begin
      perform private.run_job(m.message);
      perform pgmq.delete('jobs', m.msg_id);
      v_done := v_done + 1;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_text = message_text;
      if m.read_ct >= 5 then
        perform pgmq.send('jobs_dead', m.message || jsonb_build_object(
          'failed_at', now(), 'tries', m.read_ct, 'sqlstate', v_state, 'error', left(v_text, 200)));
        perform pgmq.delete('jobs', m.msg_id);
      end if;
    end;
    -- Leave the rest for the next run rather than overrun the schedule.
    exit when clock_timestamp() - v_started > interval '8 seconds';
  end loop;
  return v_done;
end;
$$;

revoke all on function private.run_jobs(integer, boolean) from public;

-- ---------------------------------------------------------------- what puts jobs on the queue

-- A new answer, or a changed one: XP, badges and group stats from that day on.
create or replace function private.queue_checkin_settle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue('user_settle', jsonb_build_object('user', new.user_id, 'from', new.local_date));
  return null;
end;
$$;

create trigger checkins_queue_settle_insert
  after insert on public.checkins
  for each row execute function private.queue_checkin_settle();

create trigger checkins_queue_settle_update
  after update of outcome on public.checkins
  for each row when (old.outcome is distinct from new.outcome)
  execute function private.queue_checkin_settle();

revoke all on function private.queue_checkin_settle() from public;

-- The save itself now updates only the person's own streaks and level; group
-- stats wait for the job (D-045 closed, D-070).
create or replace function private.after_checkin_saved(p_user uuid, p_level_before integer, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recompute_user_stats(p_user);
  perform private.recompute_level(p_user, p_now);
  update public.user_stats set level_before_save = p_level_before where user_id = p_user;
end;
$$;

revoke all on function private.after_checkin_saved(uuid, integer, timestamptz) from public;

-- Joining (or being approved) creates the member's row at once (zeros) and
-- queues the counts; being removed drops it.
create or replace function private.group_member_stats_on_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    insert into public.group_member_stats (group_id, user_id) values (new.group_id, new.user_id)
    on conflict (group_id, user_id) do nothing;
    perform private.enqueue('group_stats', jsonb_build_object('group', new.group_id, 'user', new.user_id));
  else
    delete from public.group_member_stats where group_id = new.group_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

-- The owner moving the challenge's dates: the whole group, on the queue.
create or replace function private.group_member_stats_on_challenge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    perform private.enqueue('group_stats', jsonb_build_object('group', new.id));
  end if;
  return null;
end;
$$;

-- Challenges that ended: once the last day is over in the group's time zone,
-- each (group, end date) is queued once. Looks back 7 days so a pause in the
-- schedule doesn't skip anyone.
create table private.challenge_finish_runs (
  group_id uuid not null references public.groups (id) on delete cascade,
  end_date date not null,
  queued_at timestamptz not null default now(),
  primary key (group_id, end_date)
);

comment on table private.challenge_finish_runs is 'Which finished challenges have been queued for XP and badges (D-071).';

create or replace function private.queue_challenge_endings(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    insert into private.challenge_finish_runs (group_id, end_date)
    select g.id, g.end_date
      from public.groups g
     where g.end_date is not null
       and g.archived_at is null
       and p_now >= ((g.end_date + 1)::timestamp at time zone g.group_timezone)
       and p_now < ((g.end_date + 8)::timestamp at time zone g.group_timezone)
    on conflict (group_id, end_date) do nothing
    returning group_id
  loop
    perform private.enqueue('challenge_finished', jsonb_build_object('group', r.group_id));
    v_count := v_count + 1;
  end loop;

  -- Failed jobs are kept 30 days for a look, then go (ids and dates only).
  delete from pgmq.q_jobs_dead where enqueued_at < p_now - interval '30 days';
  return v_count;
end;
$$;

revoke all on function private.queue_challenge_endings(timestamptz) from public;

-- Erasing an account also clears its jobs (they hold only its id).
create or replace function private.forget_jobs_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from pgmq.q_jobs where message ->> 'user' = old.id::text;
  delete from pgmq.q_jobs_dead where message ->> 'user' = old.id::text;
  return null;
end;
$$;

create trigger profiles_forget_jobs
  after delete on public.profiles
  for each row execute function private.forget_jobs_for_profile();

revoke all on function private.forget_jobs_for_profile() from public;

-- ---------------------------------------------------------------- what groups see

-- A member's six most recent badges, for the views below (which decide who
-- may see them: the same rule as the level, streak or full, D-072).
create or replace function util.member_badges(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(badge order by earned_at desc, sort desc), '{}')
    from (
      select ub.badge, ub.earned_at, b.sort
        from public.user_badges ub join public.badges b on b.slug = ub.badge
       where ub.user_id = p_user
       order by ub.earned_at desc, b.sort desc
       limit 6
    ) six;
$$;

revoke all on function util.member_badges(uuid) from public, anon;
grant execute on function util.member_badges(uuid) to authenticated, service_role;

create or replace view public.profile_cards
with (security_barrier = true)
as
select
  p.id,
  p.handle,
  p.display_name,
  p.avatar_path,
  case when util.can_see(auth.uid(), p.id, s.bio_visibility) then p.bio end as bio,
  case when util.can_see(auth.uid(), p.id, s.testimony_visibility) then p.testimony end as testimony,
  case when util.can_see(auth.uid(), p.id, s.verse_visibility) then p.favourite_verse end as favourite_verse,
  p.created_at as joined_at,
  case when util.can_see_level(auth.uid(), p.id) then util.member_level(p.id) end as level,
  case when util.can_see_level(auth.uid(), p.id) then util.member_badges(p.id) end as badges
from public.profiles p
join public.privacy_settings s on s.user_id = p.id
where p.deleted_at is null
  and p.deletion_requested_at is null
  and util.can_see(auth.uid(), p.id, s.profile_visibility);

revoke all on table public.profile_cards from anon, authenticated;
grant select on table public.profile_cards to authenticated;

-- ---------------------------------------------------------------- schedules

select cron.schedule('jobs-worker', '10 seconds', $$select private.run_jobs()$$);
select cron.schedule('challenge-endings-hourly', '23 * * * *', $$select private.queue_challenge_endings()$$);

-- ---------------------------------------------------------------- existing people

-- Pay everyone's history once (the worker picks these up).
select private.enqueue('user_settle', jsonb_build_object('user', p.id))
  from public.profiles p
 where p.deleted_at is null
   and exists (select 1 from public.checkins c where c.user_id = p.id);
