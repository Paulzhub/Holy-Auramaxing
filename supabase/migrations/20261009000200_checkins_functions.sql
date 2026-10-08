-- checkins: the check-in window, saving, streak replay and group stats
-- (CLAUDE.md §7.5). See D-042 to D-046.
--
-- Time: "a day" is a plain date in the person's own IANA time zone (§5).
-- Dates never shift with daylight saving or half-hour offsets, because the
-- instant is turned into a local date once, here, and only dates are stored.
--
-- Every function that depends on the clock takes p_now (default now()), so
-- pgTAP can pin the time: midnight in India, noon in New York, the night the
-- clocks change.

-- ---------------------------------------------------------------- time helpers

-- Today, in a time zone.
create or replace function util.local_today(p_tz text, p_now timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (p_now at time zone p_tz)::date;
$$;

-- The days someone may answer for: today, plus yesterday until 12:00 local
-- time (§7.5). Today first.
create or replace function util.checkin_dates(p_tz text, p_now timestamptz default now())
returns date[]
language sql
stable
set search_path = ''
as $$
  select case
    when (p_now at time zone p_tz)::time < time '12:00'
      then array[(p_now at time zone p_tz)::date, (p_now at time zone p_tz)::date - 1]
    else array[(p_now at time zone p_tz)::date]
  end;
$$;

-- A stored run (a streak, or the check-in streak) ending on p_last, as it
-- stands now. It's alive while the next day can still be answered: its last
-- day is today or yesterday, or the day before yesterday while yesterday is
-- still open (before 12:00). Otherwise a day was missed and the run is over:
-- 0. A missed day is never a slip; it just ends the run (D-043).
create or replace function util.live_count(
  p_count integer, p_last date, p_tz text, p_now timestamptz default now()
)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_last is null or coalesce(p_count, 0) = 0 then 0
    when p_last >= util.local_today(p_tz, p_now) - 1 then p_count
    when p_last = util.local_today(p_tz, p_now) - 2
         and (p_now at time zone p_tz)::time < time '12:00' then p_count
    else 0
  end;
$$;

grant execute on function util.local_today(text, timestamptz) to authenticated, service_role;
grant execute on function util.checkin_dates(text, timestamptz) to authenticated, service_role;
grant execute on function util.live_count(integer, date, text, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------- replay

-- Recalculates a person's streaks and totals by replaying every check-in in
-- date order ("gaps and islands"). Used after every save, so an edit inside
-- the window (clean to slipped, or back) always gives the right answer.
create or replace function private.recompute_user_stats(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with c as (
    select local_date, outcome from public.checkins where user_id = p_user
  ),
  -- Consecutive clean days share (date - row number).
  clean_runs as (
    select count(*)::integer as n, max(local_date) as last_day
      from (select local_date, local_date - (row_number() over (order by local_date))::integer as grp
              from c where outcome = 'clean') x
     group by grp
  ),
  -- Consecutive days with any check-in.
  checkin_runs as (
    select count(*)::integer as n, max(local_date) as last_day
      from (select local_date, local_date - (row_number() over (order by local_date))::integer as grp
              from c) x
     group by grp
  ),
  latest as (
    select local_date, outcome from c order by local_date desc limit 1
  )
  insert into public.user_stats as s (
    user_id, current_streak, longest_streak, total_clean_days, total_checkins, checkin_streak,
    clean_streaks, last_checkin_date, last_clean_date
  )
  select
    p_user,
    -- The clean run that ends on the latest check-in; 0 if that was a slip.
    coalesce((select r.n from clean_runs r, latest l where l.outcome = 'clean' and r.last_day = l.local_date), 0),
    coalesce((select max(n) from clean_runs), 0),
    (select count(*)::integer from c where outcome = 'clean'),
    (select count(*)::integer from c),
    coalesce((select r.n from checkin_runs r, latest l where r.last_day = l.local_date), 0),
    (select count(*)::integer from clean_runs),
    (select local_date from latest),
    (select max(local_date) from c where outcome = 'clean')
  on conflict (user_id) do update set
    current_streak = excluded.current_streak,
    longest_streak = excluded.longest_streak,
    total_clean_days = excluded.total_clean_days,
    total_checkins = excluded.total_checkins,
    checkin_streak = excluded.checkin_streak,
    clean_streaks = excluded.clean_streaks,
    last_checkin_date = excluded.last_checkin_date,
    last_clean_date = excluded.last_clean_date;
$$;

-- ---------------------------------------------------------------- group stats

-- Refreshes group_member_stats for one group (every active member), one
-- person (every group they're active in), or one membership. A check-in
-- counts toward a group's challenge from the later of the challenge's start
-- and the day the person joined (in their own time zone), up to the
-- challenge's end (D-045).
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

  insert into public.group_member_stats as s (group_id, user_id, clean_days_in_challenge, checkins_in_challenge)
  select m.group_id, m.user_id,
         count(c.id) filter (where c.outcome = 'clean')::integer,
         count(c.id)::integer
    from public.group_members m
    join public.groups g on g.id = m.group_id
    join public.profiles p on p.id = m.user_id
    left join public.checkins c
      on c.user_id = m.user_id
     and c.local_date >= greatest(g.start_date, (m.joined_at at time zone p.timezone)::date)
     and (g.end_date is null or c.local_date <= g.end_date)
   where m.status = 'active'
     and (p_group is null or m.group_id = p_group)
     and (p_user is null or m.user_id = p_user)
   group by m.group_id, m.user_id
  on conflict (group_id, user_id) do update set
    clean_days_in_challenge = excluded.clean_days_in_challenge,
    checkins_in_challenge = excluded.checkins_in_challenge;
end;
$$;

-- Joining (or being approved) creates the member's row; being removed drops it.
create or replace function private.group_member_stats_on_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    perform private.refresh_group_stats(new.group_id, new.user_id);
  else
    delete from public.group_member_stats where group_id = new.group_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

create trigger group_members_refresh_stats
  after insert or update of status, joined_at on public.group_members
  for each row execute function private.group_member_stats_on_membership();

-- The owner moving the challenge's dates changes what counts.
create or replace function private.group_member_stats_on_challenge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    perform private.refresh_group_stats(new.id, null);
  end if;
  return null;
end;
$$;

create trigger groups_refresh_member_stats
  after update of start_date, end_date on public.groups
  for each row execute function private.group_member_stats_on_challenge();

-- Rows for memberships that existed before this migration.
insert into public.group_member_stats (group_id, user_id)
select group_id, user_id from public.group_members where status = 'active'
on conflict do nothing;

-- ---------------------------------------------------------------- saving

-- Clean up the optional answers. Errors use short keys like the groups
-- functions ('checkin_invalid'), turned into copy by the app.
create or replace function private.clean_triggers(p_triggers text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text[];
begin
  -- Keep the fixed list's order and drop duplicates.
  select coalesce(array_agg(t order by o), '{}') into v
    from unnest(util.checkin_triggers()) with ordinality as l(t, o)
   where t = any (coalesce(p_triggers, '{}'));
  if cardinality(coalesce(p_triggers, '{}')) > 0
     and exists (select 1 from unnest(p_triggers) x where not (x = any (util.checkin_triggers()))) then
    raise exception 'checkin_invalid';
  end if;
  return v;
end;
$$;

create or replace function private.check_note(p_note text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_note is not null and (
       p_note !~ '^v[0-9]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]*$' or char_length(p_note) > 8000) then
    raise exception 'checkin_invalid';
  end if;
end;
$$;

-- The caller's time zone, refusing accounts that are closing (D-033).
create or replace function private.checkin_caller(out caller_id uuid, out tz text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  caller_id := private.caller();
  select p.timezone into tz from public.profiles p
   where p.id = caller_id and p.deleted_at is null and p.deletion_requested_at is null;
  if tz is null then
    raise exception 'account_closing' using errcode = '42501';
  end if;
end;
$$;

-- Saves (or, inside the window, edits) the check-in for one day. Returns
-- 'created' or 'updated'. p_now is for tests; the public wrapper passes now().
create or replace function private.save_checkin(
  p_user uuid,
  p_tz text,
  p_local_date date,
  p_outcome text,
  p_mood integer,
  p_urge_level integer,
  p_triggers text[],
  p_note_encrypted text,
  p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_triggers text[];
  v_id uuid;
  v_created boolean;
begin
  if p_local_date is null or not (p_local_date = any (util.checkin_dates(p_tz, p_now))) then
    raise exception 'checkin_window_closed';
  end if;
  if p_outcome is null or p_outcome not in ('clean', 'slipped')
     or (p_mood is not null and p_mood not between 1 and 5)
     or (p_urge_level is not null and p_urge_level not between 0 and 5) then
    raise exception 'checkin_invalid';
  end if;
  v_triggers := private.clean_triggers(p_triggers);
  perform private.check_note(p_note_encrypted);

  insert into public.checkins as c (user_id, local_date, timezone, outcome, mood, urge_level, triggers, note_encrypted)
  values (p_user, p_local_date, p_tz, p_outcome, p_mood, p_urge_level, v_triggers, p_note_encrypted)
  on conflict (user_id, local_date) do update set
    timezone = excluded.timezone,
    outcome = excluded.outcome,
    mood = excluded.mood,
    urge_level = excluded.urge_level,
    triggers = excluded.triggers,
    note_encrypted = excluded.note_encrypted,
    edit_count = c.edit_count + 1
  returning c.id, (xmax = 0) into v_id, v_created;

  -- Edits are audited (§7.5): which check-in, never what it says.
  if not v_created then
    perform util.audit(p_user, 'checkin.edited', 'checkin', v_id, '{}'::jsonb);
  end if;

  perform private.recompute_user_stats(p_user);
  perform private.refresh_group_stats(null, p_user);
  return case when v_created then 'created' else 'updated' end;
end;
$$;

-- After a slip: the optional "what led to it?" reflection (triggers and a
-- private note) for a day that already has a check-in, inside the window.
create or replace function private.save_checkin_reflection(
  p_user uuid,
  p_tz text,
  p_local_date date,
  p_triggers text[],
  p_note_encrypted text,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_triggers text[] := private.clean_triggers(p_triggers);
  v_id uuid;
begin
  if p_local_date is null or not (p_local_date = any (util.checkin_dates(p_tz, p_now))) then
    raise exception 'checkin_window_closed';
  end if;
  perform private.check_note(p_note_encrypted);
  update public.checkins
     set triggers = v_triggers, note_encrypted = p_note_encrypted, edit_count = edit_count + 1
   where user_id = p_user and local_date = p_local_date
  returning id into v_id;
  if v_id is null then
    raise exception 'checkin_not_found';
  end if;
  perform util.audit(p_user, 'checkin.edited', 'checkin', v_id, '{"part":"reflection"}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- public API

create or replace function public.submit_checkin(
  p_local_date date,
  p_outcome text,
  p_mood integer default null,
  p_urge_level integer default null,
  p_triggers text[] default '{}',
  p_note_encrypted text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.checkin_caller();
  return private.save_checkin(c.caller_id, c.tz, p_local_date, p_outcome, p_mood, p_urge_level, p_triggers,
                              p_note_encrypted, now());
end;
$$;

create or replace function public.save_checkin_reflection(
  p_local_date date,
  p_triggers text[] default '{}',
  p_note_encrypted text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.checkin_caller();
  perform private.save_checkin_reflection(c.caller_id, c.tz, p_local_date, p_triggers, p_note_encrypted, now());
end;
$$;

-- Everything the check-in and home screens need, in one round trip: the
-- window, the days already answered, and the live streaks.
create or replace function private.checkin_overview(p_user uuid, p_tz text, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'timezone', p_tz,
    'today', util.local_today(p_tz, p_now),
    'open_dates', to_jsonb(util.checkin_dates(p_tz, p_now)),
    'answered', coalesce((
      select jsonb_object_agg(c.local_date::text, c.outcome)
        from public.checkins c
       where c.user_id = p_user and c.local_date = any (util.checkin_dates(p_tz, p_now))
    ), '{}'::jsonb),
    'current_streak', util.live_count(s.current_streak, s.last_checkin_date, p_tz, p_now),
    'checkin_streak', util.live_count(s.checkin_streak, s.last_checkin_date, p_tz, p_now),
    'longest_streak', coalesce(s.longest_streak, 0),
    'total_clean_days', coalesce(s.total_clean_days, 0),
    'total_checkins', coalesce(s.total_checkins, 0),
    'clean_streaks', coalesce(s.clean_streaks, 0),
    'last_checkin_date', s.last_checkin_date,
    'last_clean_date', s.last_clean_date
  )
  from (select 1) one
  left join public.user_stats s on s.user_id = p_user;
$$;

create or replace function public.my_checkin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.checkin_caller();
  return private.checkin_overview(c.caller_id, c.tz, now());
end;
$$;

-- ---------------------------------------------------------------- grants

revoke all on function private.recompute_user_stats(uuid) from public;
revoke all on function private.refresh_group_stats(uuid, uuid) from public;
revoke all on function private.save_checkin(uuid, text, date, text, integer, integer, text[], text, timestamptz) from public;
revoke all on function private.save_checkin_reflection(uuid, text, date, text[], text, timestamptz) from public;
revoke all on function private.checkin_overview(uuid, text, timestamptz) from public;
revoke all on function private.checkin_caller() from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.submit_checkin(date, text, integer, integer, text[], text)',
    'public.save_checkin_reflection(date, text[], text)',
    'public.my_checkin_overview()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
