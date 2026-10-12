-- gamification: leaderboards, the group goal, the "Together" total and invite
-- details (CLAUDE.md §7.4, §7.6, §14). See D-074 to D-076.
--
-- Leaderboards are stored, one row per active membership, and refreshed by
-- the job queue (D-070): every job that changes XP, check-ins or group stats
-- also refreshes the matching rows, and a new `leaderboard` job does it on
-- its own (a goal set, a live value gone stale).
--
-- What a board shows is decided when it's read, from the membership as it is
-- now: checkin_only members appear only on the XP and Encourager boards
-- (a streak, a level or a count of free days would show a slip); hiding works
-- only while the covenant allows it, and a hidden member keeps their place
-- with no name or photo (owner, 2026-10-12); closing accounts are left out.
--
-- Levels and streaks fall without any event (a missed day, D-063), so each
-- row stores `stale_at`: the moment its live level or streak would next drop.
-- A read recalculates the few rows past it, and `leaderboard-tick` queues
-- them so the stored values catch up. No nightly job.

-- ---------------------------------------------------------------- the goal

-- One goal per group, repeating every week, month, quarter or year in the
-- group's time zone (owner, 2026-10-12): "500 free days together this month".
create table public.group_goals (
  group_id uuid primary key references public.groups (id) on delete cascade,
  period text not null check (period in ('week', 'month', 'quarter', 'year')),
  target integer not null check (target between 1 and 1000000),
  set_by uuid references public.profiles (id) on delete set null,
  set_at timestamptz not null default now()
);

comment on table public.group_goals is
  'A group''s repeating goal of free days together (§7.6, D-075). Members read; written only by set_group_goal / end_group_goal.';

alter table public.group_goals enable row level security;
revoke all on table public.group_goals from anon, authenticated;
grant select on table public.group_goals to authenticated;

create policy "group_goals: members read" on public.group_goals
  for select to authenticated
  using (util.group_status(group_id) = 'active');
create policy "group_goals: live, verified session" on public.group_goals
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- The first and last day of the goal period that contains p_day.
create or replace function util.goal_period_start(p_period text, p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select date_trunc(p_period, p_day::timestamp)::date;
$$;

create or replace function util.goal_period_end(p_period text, p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc(p_period, p_day::timestamp) + case p_period
            when 'week' then interval '7 days' when 'month' then interval '1 month'
            when 'quarter' then interval '3 months' when 'year' then interval '1 year' end)::date - 1;
$$;

-- The Monday that starts the week containing p_day.
create or replace function util.week_start(p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select date_trunc('week', p_day::timestamp)::date;
$$;

grant execute on function util.goal_period_start(text, date) to authenticated, service_role;
grant execute on function util.goal_period_end(text, date) to authenticated, service_role;
grant execute on function util.week_start(date) to authenticated, service_role;

-- ---------------------------------------------------------------- the stored boards

create table public.leaderboard_entries (
  group_id uuid not null,
  user_id uuid not null,
  -- Consistency XP: the group's own XP plus check-in XP inside the member's
  -- challenge window (as group_member_stats.xp_in_group), and this week's.
  xp integer not null default 0,
  xp_at timestamptz,
  xp_week integer not null default 0,
  xp_week_at timestamptz,
  -- The live level and current streak as of the last refresh.
  level integer not null default 0,
  level_at timestamptz,
  streak integer not null default 0,
  streak_at timestamptz,
  -- Free days inside the challenge, and this week's.
  free_days integer not null default 0,
  free_days_at timestamptz,
  free_days_week integer not null default 0,
  free_days_week_at timestamptz,
  -- Encouragement XP given in this group (Phase 6), and this week's.
  encourager integer not null default 0,
  encourager_at timestamptz,
  encourager_week integer not null default 0,
  encourager_week_at timestamptz,
  -- The week (Monday, group's time zone) the *_week columns are for; a read
  -- in a later week sees 0 without waiting for a job.
  week_of date not null,
  -- Free days in the current goal period, and which period ("month:2026-10-01").
  goal_key text,
  goal_days integer not null default 0,
  -- When the live level or streak would next fall (null: nothing can fall).
  stale_at timestamptz,
  refreshed_at timestamptz not null default now(),
  primary key (group_id, user_id),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on delete cascade
);

comment on table public.leaderboard_entries is
  'Stored leaderboard values per membership (§7.6, §14, D-074), refreshed by jobs. Read through group_leaderboard() and group_together(), which apply share levels and hiding.';

create index leaderboard_entries_user_idx on public.leaderboard_entries (user_id);
create index leaderboard_entries_stale_idx on public.leaderboard_entries (stale_at) where stale_at is not null;

alter table public.leaderboard_entries enable row level security;
revoke all on table public.leaderboard_entries from anon, authenticated;
grant select on table public.leaderboard_entries to authenticated;

-- Your own rows only; everyone else's go through the functions below.
create policy "leaderboard_entries: owner reads" on public.leaderboard_entries
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "leaderboard_entries: live, verified session" on public.leaderboard_entries
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- Refreshes the rows of a group, of one person (in all their groups), or of
-- one membership. Ties are broken by when a value was reached: for XP and
-- encouragement the newest ledger row that counts, for free days the newest
-- free day's check-in, for the streak the check-in that reached it, for the
-- level the refresh that first saw it.
create or replace function private.refresh_leaderboard(
  p_group uuid default null, p_user uuid default null, p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_group is null and p_user is null then
    raise exception 'refresh_leaderboard needs a group or a person';
  end if;

  -- Memberships that ended (removed) lose their row; leaving deletes it by cascade.
  delete from public.leaderboard_entries e
   where (p_group is null or e.group_id = p_group)
     and (p_user is null or e.user_id = p_user)
     and not exists (select 1 from public.group_members m
                      where m.group_id = e.group_id and m.user_id = e.user_id and m.status = 'active');

  insert into public.leaderboard_entries as e (
    group_id, user_id, xp, xp_at, xp_week, xp_week_at, level, level_at, streak, streak_at,
    free_days, free_days_at, free_days_week, free_days_week_at,
    encourager, encourager_at, encourager_week, encourager_week_at,
    week_of, goal_key, goal_days, stale_at, refreshed_at)
  select w.group_id, w.user_id,
         xa.points, xa.at, xw.points, xw.at,
         lv.level, p_now, st.live, st.at,
         fa.n, fa.at, fw.n, fw.at,
         ea.points, ea.at, ew.points, ew.at,
         w.week_of,
         case when w.goal_period is not null then w.goal_period || ':' || w.goal_from end,
         coalesce(gd.n, 0),
         case
           when s.last_checkin_date is null or (lv.level = 0 and st.live = 0) then null
           else least(
             util.window_close(greatest(s.last_checkin_date + 1, w.last_closed + 1), w.tz),
             case when s.level_open_until > p_now then s.level_open_until end)
         end,
         p_now
    from (
      select m.group_id, m.user_id, p.timezone as tz,
             greatest(gr.start_date, (m.joined_at at time zone p.timezone)::date) as from_day,
             gr.end_date as to_day,
             (m.joined_at at time zone p.timezone)::date as joined_day,
             gr.week_of, gr.goal_period, gr.goal_from, gr.goal_to,
             (select min(d) - 1 from unnest(util.checkin_dates(p.timezone, p_now)) d) as last_closed
        from public.group_members m
        join public.profiles p on p.id = m.user_id
        join (
          -- Worked out once per group: this week, and the goal's current period.
          select g.id, g.start_date, g.end_date, x.week_of, gg.period as goal_period,
                 util.goal_period_start(gg.period, x.today) as goal_from,
                 util.goal_period_end(gg.period, x.today) as goal_to
            from public.groups g
            cross join lateral (select util.local_today(g.group_timezone, p_now) as today) t
            cross join lateral (select t.today, util.week_start(t.today) as week_of) x
            left join public.group_goals gg on gg.group_id = g.id
           where p_group is null or g.id = p_group
           offset 0
        ) gr on gr.id = m.group_id
       where m.status = 'active'
         and (p_group is null or m.group_id = p_group)
         and (p_user is null or m.user_id = p_user)
    ) w
    left join public.user_stats s on s.user_id = w.user_id
    cross join lateral private.live_level(w.user_id, w.tz, p_now) lv
    cross join lateral (
      select util.live_count(s.current_streak, s.last_checkin_date, w.tz, p_now) as live,
             case when util.live_count(s.current_streak, s.last_checkin_date, w.tz, p_now) > 0 then
               (select c.created_at from public.checkins c
                 where c.user_id = w.user_id and c.local_date = s.last_checkin_date)
             end as at
    ) st
    cross join lateral (
      select coalesce(sum(x.points), 0)::integer as points, max(x.created_at) as at
        from public.xp_ledger x
       where x.user_id = w.user_id
         and (x.group_id = w.group_id
              or (x.group_id is null and x.local_date >= w.from_day
                  and (w.to_day is null or x.local_date <= w.to_day)))
    ) xa
    cross join lateral (
      select coalesce(sum(x.points), 0)::integer as points, max(x.created_at) as at
        from public.xp_ledger x
       where x.user_id = w.user_id
         and x.local_date between w.week_of and w.week_of + 6
         and (x.group_id = w.group_id
              or (x.group_id is null and x.local_date >= w.from_day
                  and (w.to_day is null or x.local_date <= w.to_day)))
    ) xw
    cross join lateral (
      select count(*)::integer as n, max(c.created_at) as at
        from public.checkins c
       where c.user_id = w.user_id and c.outcome = 'clean'
         and c.local_date >= w.from_day and (w.to_day is null or c.local_date <= w.to_day)
    ) fa
    cross join lateral (
      select count(*)::integer as n, max(c.created_at) as at
        from public.checkins c
       where c.user_id = w.user_id and c.outcome = 'clean'
         and c.local_date between w.week_of and w.week_of + 6
         and c.local_date >= w.from_day and (w.to_day is null or c.local_date <= w.to_day)
    ) fw
    cross join lateral (
      select coalesce(sum(x.points), 0)::integer as points, max(x.created_at) as at
        from public.xp_ledger x
       where x.user_id = w.user_id and x.group_id = w.group_id and x.reason = 'encouragement'
    ) ea
    cross join lateral (
      select coalesce(sum(x.points), 0)::integer as points, max(x.created_at) as at
        from public.xp_ledger x
       where x.user_id = w.user_id and x.group_id = w.group_id and x.reason = 'encouragement'
         and x.local_date between w.week_of and w.week_of + 6
    ) ew
    left join lateral (
      select count(*)::integer as n
        from public.checkins c
       where w.goal_period is not null
         and c.user_id = w.user_id and c.outcome = 'clean'
         and c.local_date between greatest(w.goal_from, w.joined_day) and w.goal_to
    ) gd on true
  on conflict (group_id, user_id) do update set
    xp = excluded.xp, xp_at = excluded.xp_at,
    xp_week = excluded.xp_week, xp_week_at = excluded.xp_week_at,
    level = excluded.level,
    level_at = case when e.level is distinct from excluded.level then excluded.level_at else e.level_at end,
    streak = excluded.streak, streak_at = excluded.streak_at,
    free_days = excluded.free_days, free_days_at = excluded.free_days_at,
    free_days_week = excluded.free_days_week, free_days_week_at = excluded.free_days_week_at,
    encourager = excluded.encourager, encourager_at = excluded.encourager_at,
    encourager_week = excluded.encourager_week, encourager_week_at = excluded.encourager_week_at,
    week_of = excluded.week_of, goal_key = excluded.goal_key, goal_days = excluded.goal_days,
    stale_at = excluded.stale_at, refreshed_at = excluded.refreshed_at;
end;
$$;

revoke all on function private.refresh_leaderboard(uuid, uuid, timestamptz) from public;

-- Every 10 minutes: queue the people whose live level or streak has fallen
-- since their rows were stored. Reads are already right (they recalculate
-- stale rows); this keeps the stored values close.
create or replace function private.queue_leaderboard_ticks(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_n integer := 0;
begin
  for v_user in
    select distinct e.user_id from public.leaderboard_entries e where e.stale_at <= p_now
  loop
    perform private.enqueue('leaderboard', jsonb_build_object('user', v_user));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function private.queue_leaderboard_ticks(timestamptz) from public;

-- ---------------------------------------------------------------- the queue, extended

create or replace function private.enqueue(p_type text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_type not in ('user_settle', 'group_stats', 'challenge_finished', 'encouragement', 'devotional',
                    'leaderboard') then
    raise exception 'job_unknown_type';
  end if;
  perform pgmq.send('jobs', jsonb_build_object('type', p_type) || coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function private.enqueue(text, jsonb) from public;

-- As in 5b, plus: every job that changes stats refreshes the leaderboard rows
-- it touched, and `leaderboard` refreshes a group, a person or a membership.
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
      perform private.refresh_leaderboard(null, v_user);
    when 'group_stats' then
      if v_group is null then
        raise exception 'job_bad_payload';
      end if;
      perform private.refresh_group_stats(v_group, v_user);
      perform private.refresh_leaderboard(v_group, v_user);
    when 'leaderboard' then
      if v_group is null and v_user is null then
        raise exception 'job_bad_payload';
      end if;
      perform private.refresh_leaderboard(v_group, v_user);
    when 'encouragement' then
      perform private.award_encouragement(v_user, p_msg ->> 'key', v_group,
                                          coalesce((p_msg ->> 'at')::timestamptz, now()));
      perform private.refresh_user_xp(v_user);
      if v_group is not null and exists (select 1 from public.groups where id = v_group) then
        perform private.refresh_group_stats(v_group, v_user);
        perform private.refresh_leaderboard(v_group, v_user);
      end if;
    when 'devotional' then
      perform private.award_devotional(v_user, p_msg ->> 'key', coalesce((p_msg ->> 'at')::timestamptz, now()));
      perform private.refresh_user_xp(v_user);
      perform private.refresh_group_stats(null, v_user);
      perform private.refresh_leaderboard(null, v_user);
    when 'challenge_finished' then
      if v_group is null then
        raise exception 'job_bad_payload';
      end if;
      for v_member in select * from private.award_challenge_finished(v_group) loop
        perform private.refresh_user_xp(v_member);
      end loop;
      perform private.refresh_group_stats(v_group, null);
      perform private.refresh_leaderboard(v_group, null);
    else
      raise exception 'job_unknown_type';
  end case;
end;
$$;

revoke all on function private.run_job(jsonb) from public;

-- A membership that stops being active loses its row at once (the board must
-- not show someone who was removed while the job waits).
create or replace function private.leaderboard_on_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    delete from public.leaderboard_entries where group_id = new.group_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

create trigger group_members_leaderboard
  after update of status on public.group_members
  for each row when (old.status = 'active' and new.status <> 'active')
  execute function private.leaderboard_on_membership();

revoke all on function private.leaderboard_on_membership() from public;

-- ---------------------------------------------------------------- reading a board

-- One board of a group, for its active members (D-074). Boards: xp (default),
-- level, streak, free_days, encourager; periods: all, or week (xp, free_days
-- and encourager only). Rank is 1..n with no shared places; ties go to whoever
-- got there first. Returns a page (ranks after p_after, up to p_limit) plus
-- the caller's own row wherever it is. A hidden member's row keeps its place
-- but carries no id, except to themselves.
create or replace function public.group_leaderboard(
  p_group uuid, p_board text default 'xp', p_period text default 'all',
  p_after integer default 0, p_limit integer default 50
)
returns table (place integer, member_id uuid, score integer, is_me boolean, is_hidden boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  g public.groups;
  v_week date;
  v_now timestamptz := now();
begin
  if v_uid is null or not util.session_ok() or not exists (
    select 1 from public.group_members m
     where m.group_id = p_group and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'group_not_found' using errcode = '42501';
  end if;
  if p_board is null or p_board not in ('xp', 'level', 'streak', 'free_days', 'encourager')
     or p_period is null or p_period not in ('all', 'week')
     or (p_period = 'week' and p_board in ('level', 'streak'))
     or p_after is null or p_after < 0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into g from public.groups where id = p_group;
  v_week := util.week_start(util.local_today(g.group_timezone, v_now));

  return query
  with eligible as (
    select e.*, (m.leaderboard_hidden and g.leaderboard_hiding_allowed) as hidden,
           p.timezone, s.current_streak, s.last_checkin_date,
           coalesce(e.stale_at <= v_now, false) as stale
      from public.leaderboard_entries e
      join public.group_members m
        on m.group_id = e.group_id and m.user_id = e.user_id and m.status = 'active'
      join public.profiles p
        on p.id = e.user_id and p.deleted_at is null and p.deletion_requested_at is null
      left join public.user_stats s on s.user_id = e.user_id
     where e.group_id = p_group
       -- A level, a streak or a count of free days would show a slip.
       and (p_board in ('xp', 'encourager') or util.share_rank(m.share_level) >= 1)
  ),
  scored as (
    select el.user_id, el.hidden,
           case p_board
             when 'xp' then
               case when p_period = 'all' then el.xp when el.week_of = v_week then el.xp_week else 0 end
             when 'encourager' then
               case when p_period = 'all' then el.encourager when el.week_of = v_week then el.encourager_week else 0 end
             when 'free_days' then
               case when p_period = 'all' then el.free_days when el.week_of = v_week then el.free_days_week else 0 end
             when 'level' then
               case when el.stale then util.member_level(el.user_id) else el.level end
             when 'streak' then
               case when el.stale then util.live_count(el.current_streak, el.last_checkin_date, el.timezone, v_now)
                    else el.streak end
           end as v,
           case p_board
             when 'xp' then
               case when p_period = 'all' then el.xp_at when el.week_of = v_week then el.xp_week_at end
             when 'encourager' then
               case when p_period = 'all' then el.encourager_at when el.week_of = v_week then el.encourager_week_at end
             when 'free_days' then
               case when p_period = 'all' then el.free_days_at when el.week_of = v_week then el.free_days_week_at end
             when 'level' then el.level_at
             when 'streak' then el.streak_at
           end as at
      from eligible el
  ),
  ranked as (
    select row_number() over (order by sc.v desc, sc.at asc nulls last, sc.user_id)::integer as rk, sc.*
      from scored sc
  )
  select r.rk,
         case when r.hidden and r.user_id <> v_uid then null else r.user_id end,
         coalesce(r.v, 0),
         r.user_id = v_uid,
         r.hidden
    from ranked r
   where (r.rk > p_after and r.rk <= p_after + p_limit) or r.user_id = v_uid
   order by r.rk;
end;
$$;

revoke all on function public.group_leaderboard(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.group_leaderboard(uuid, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------- Together and the goal

-- The group's free days together and its goal (D-075). Only members who share
-- their streak or more are counted: a checkin_only member's answer must never
-- move the number either way (D-044). Hidden members still count (hiding is
-- about the leaderboard, not the total).
create or replace function public.group_together(p_group uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  g public.groups;
  gg public.group_goals;
  v_today date;
  v_key text;
  v_from date;
  v_to date;
  v_free bigint;
  v_counted bigint;
  v_total bigint;
  v_progress bigint;
begin
  if v_uid is null or not util.session_ok() or not exists (
    select 1 from public.group_members m
     where m.group_id = p_group and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'group_not_found' using errcode = '42501';
  end if;

  select * into g from public.groups where id = p_group;
  select * into gg from public.group_goals where group_id = p_group;
  v_today := util.local_today(g.group_timezone);
  if gg.group_id is not null then
    v_from := util.goal_period_start(gg.period, v_today);
    v_to := util.goal_period_end(gg.period, v_today);
    v_key := gg.period || ':' || v_from;
  end if;

  select coalesce(sum(e.free_days) filter (where util.share_rank(m.share_level) >= 1), 0),
         count(*) filter (where util.share_rank(m.share_level) >= 1),
         count(*),
         coalesce(sum(e.goal_days) filter (where util.share_rank(m.share_level) >= 1 and e.goal_key = v_key), 0)
    into v_free, v_counted, v_total, v_progress
    from public.group_members m
    join public.profiles p
      on p.id = m.user_id and p.deleted_at is null and p.deletion_requested_at is null
    left join public.leaderboard_entries e on e.group_id = m.group_id and e.user_id = m.user_id
   where m.group_id = p_group and m.status = 'active';

  return jsonb_build_object(
    'free_days', v_free,
    'members_counted', v_counted,
    'members_total', v_total,
    'goal', case when gg.group_id is null then null else jsonb_build_object(
      'period', gg.period, 'target', gg.target, 'progress', v_progress,
      'starts_on', v_from, 'ends_on', v_to) end);
end;
$$;

revoke all on function public.group_together(uuid) from public, anon;
grant execute on function public.group_together(uuid) to authenticated;

-- Owners and admins set the goal (replacing any other) or end it.
create or replace function public.set_group_goal(p_group uuid, p_period text, p_target integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select * into l from private.lock_group(p_group, 'admin');
  perform private.throttle(l.caller_id, 'group_goal', 30, interval '1 hour');
  if (select archived_at from public.groups where id = p_group) is not null then
    raise exception 'group_archived';
  end if;
  if p_period is null or p_period not in ('week', 'month', 'quarter', 'year')
     or p_target is null or p_target not between 1 and 1000000 then
    raise exception 'invalid_input';
  end if;
  insert into public.group_goals as gg (group_id, period, target, set_by, set_at)
  values (p_group, p_period, p_target, l.caller_id, now())
  on conflict (group_id) do update set
    period = excluded.period, target = excluded.target, set_by = excluded.set_by, set_at = excluded.set_at;
  perform private.group_audit(l.caller_id, 'group.goal_set', p_group, null,
    jsonb_build_object('period', p_period, 'target', p_target));
  -- Each member's days in the new period.
  perform private.enqueue('leaderboard', jsonb_build_object('group', p_group));
end;
$$;

create or replace function public.end_group_goal(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select * into l from private.lock_group(p_group, 'admin');
  perform private.throttle(l.caller_id, 'group_goal', 30, interval '1 hour');
  delete from public.group_goals where group_id = p_group;
  if found then
    perform private.group_audit(l.caller_id, 'group.goal_ended', p_group, null, '{}'::jsonb);
  end if;
end;
$$;

revoke all on function public.set_group_goal(uuid, text, integer) from public, anon;
revoke all on function public.end_group_goal(uuid) from public, anon;
grant execute on function public.set_group_goal(uuid, text, integer) to authenticated;
grant execute on function public.end_group_goal(uuid) to authenticated;

-- ---------------------------------------------------------------- invite details

-- Who joined, or asked to join, with one invite (D-076): for the group's
-- owners and admins only. Ids only; the app shows names through profile_cards
-- (each person's own privacy settings). Closing accounts are left out.
create or replace function public.group_invite_people(p_invite uuid)
returns table (member_id uuid, member_status text, since timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  select i.group_id into v_group from public.group_invites i where i.id = p_invite;
  if v_uid is null or v_group is null or not util.session_ok() then
    raise exception 'group_not_found' using errcode = '42501';
  end if;
  if not exists (select 1 from public.group_members m
                  where m.group_id = v_group and m.user_id = v_uid and m.status = 'active'
                    and m.role in ('owner', 'admin')) then
    raise exception 'group_not_found' using errcode = '42501';
  end if;
  return query
  select m.user_id, m.status, coalesce(m.joined_at, m.requested_at)
    from public.group_members m
    join public.profiles p
      on p.id = m.user_id and p.deleted_at is null and p.deletion_requested_at is null
   where m.group_id = v_group and m.invite_id = p_invite and m.status in ('active', 'pending')
   order by coalesce(m.joined_at, m.requested_at) desc, m.user_id
   limit 500;
end;
$$;

revoke all on function public.group_invite_people(uuid) from public, anon;
grant execute on function public.group_invite_people(uuid) to authenticated;

create index group_members_invite_idx on public.group_members (invite_id) where invite_id is not null;

-- ---------------------------------------------------------------- fill and schedule

do $$
declare
  v_group uuid;
begin
  for v_group in select id from public.groups loop
    perform private.refresh_leaderboard(v_group, null);
  end loop;
end;
$$;

select cron.schedule('leaderboard-tick', '*/10 * * * *', $$select private.queue_leaderboard_ticks()$$);
