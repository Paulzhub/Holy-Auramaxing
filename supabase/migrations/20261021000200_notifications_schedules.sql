-- notifications: the scheduler (CLAUDE.md §7.5, §7.8, §14). Phase 7b; see D-091.
--
-- pg_cron runs private.notify_schedule() every 15 minutes. Each run picks the
-- people whose own local time matches, and queues one 'direct' job each, so
-- the worker spreads the work. Every notification has a dedupe key, so a run
-- that repeats (a retry, an overlapping window) never notifies twice; a
-- 30-minute window means one missed run loses nothing.
--
--   daily reminder     at the person's reminder time, if they haven't checked in today
--   streak at risk     20:00 local, if yesterday was answered and today isn't yet
--   partner missed     once per absence, after the second day without a check-in
--                      has closed, to each partner the person allowed (D-083)
--   weekly recap       Sunday 18:00 local
--   challenge starts   once, on the group's first day
--   digests            19:00 local: daily, or on Sundays for weekly
--   retention          notifications after 90 days; dead jobs after 30
--
-- Accounts that are closing get nothing (deliver() leaves them out too).

-- Minutes since a local time of day, 0..1439, across midnight.
create or replace function util.minutes_since(p_now timestamptz, p_tz text, p_at time)
returns integer
language sql
stable
set search_path = ''
as $$
  select (floor((extract(epoch from (p_now at time zone p_tz)::time) - extract(epoch from p_at)) / 60)::integer % 1440
          + 1440) % 1440;
$$;

grant execute on function util.minutes_since(timestamptz, text, time) to authenticated, service_role;

create table private.challenge_start_runs (
  group_id uuid not null references public.groups (id) on delete cascade,
  start_date date not null,
  queued_at timestamptz not null default now(),
  primary key (group_id, start_date)
);

comment on table private.challenge_start_runs is
  'Challenges whose "starting today" notice was queued, once each (D-091).';

-- One direct job, unless that person already has it.
create or replace function private.queue_direct(
  p_user uuid, p_type text, p_dedupe text, p_data jsonb default '{}'::jsonb, p_group uuid default null,
  p_actor uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notifications n where n.user_id = p_user and n.dedupe_key = p_dedupe) then
    return false;
  end if;
  perform private.notify('direct', jsonb_build_object('user', p_user, 'type', p_type, 'dedupe', p_dedupe,
                                                      'data', p_data, 'group', p_group, 'actor', p_actor));
  return true;
end;
$$;

revoke all on function private.queue_direct(uuid, text, text, jsonb, uuid, uuid) from public;

create or replace function private.notify_schedule(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_reminders integer := 0;
  v_at_risk integer := 0;
  v_partner integer := 0;
  v_recaps integer := 0;
  v_starts integer := 0;
  v_digests integer := 0;
  v_at_risk_at time := make_time(util.config_int('notify_at_risk_hour'), 0, 0);
  v_recap_at time := make_time(util.config_int('notify_recap_hour'), 0, 0);
begin
  -- Daily reminder, at the person's own time.
  for r in
    select p.id, util.local_today(p.timezone, p_now) as today
      from public.profiles p
      join public.notification_settings s on s.user_id = p.id
     where s.reminder_time is not null
       and p.deleted_at is null and p.deletion_requested_at is null and p.onboarded_at is not null
       and util.minutes_since(p_now, p.timezone, s.reminder_time) < 30
       and not exists (select 1 from public.checkins c
                        where c.user_id = p.id and c.local_date = util.local_today(p.timezone, p_now))
  loop
    if private.queue_direct(r.id, 'daily_reminder', 'reminder:' || r.today) then
      v_reminders := v_reminders + 1;
    end if;
  end loop;

  -- Still time today: yesterday was answered, today isn't yet.
  for r in
    select p.id, util.local_today(p.timezone, p_now) as today
      from public.profiles p
      join public.user_stats st on st.user_id = p.id
     where p.deleted_at is null and p.deletion_requested_at is null and p.onboarded_at is not null
       and util.minutes_since(p_now, p.timezone, v_at_risk_at) < 30
       and st.last_checkin_date = util.local_today(p.timezone, p_now) - 1
  loop
    if private.queue_direct(r.id, 'streak_at_risk', 'at_risk:' || r.today) then
      v_at_risk := v_at_risk + 1;
    end if;
  end loop;

  -- A partner who allowed alerts has had two days close without a check-in
  -- (and none today). Once per absence: the key is their last check-in.
  for r in
    select x.id as partnership, x.group_id, v.subject, v.partner, st.last_checkin_date
      from public.partnerships x
     cross join lateral (values (x.user_a, x.user_b, x.a_allows_alerts), (x.user_b, x.user_a, x.b_allows_alerts))
                        v(subject, partner, allowed)
      join public.profiles p on p.id = v.subject and p.deleted_at is null and p.deletion_requested_at is null
      left join public.user_stats st on st.user_id = v.subject
     where x.status = 'active' and v.allowed
       and p_now >= util.window_close(util.local_today(p.timezone, p_now) - 1, p.timezone)
       and (p.created_at at time zone p.timezone)::date <= util.local_today(p.timezone, p_now) - 2
       and coalesce(st.last_checkin_date, '-infinity'::date) < util.local_today(p.timezone, p_now) - 2
       and coalesce(x.accepted_at, x.requested_at) <= util.window_close(util.local_today(p.timezone, p_now) - 1, p.timezone)
  loop
    if private.queue_direct(r.partner, 'partner_missed',
                            'partner_missed:' || r.partnership || ':' || coalesce(r.last_checkin_date::text, 'none'),
                            '{}'::jsonb, r.group_id, r.subject) then
      v_partner := v_partner + 1;
    end if;
  end loop;

  -- The Sunday recap.
  for r in
    select p.id, util.week_start(util.local_today(p.timezone, p_now)) as week
      from public.profiles p
     where p.deleted_at is null and p.deletion_requested_at is null and p.onboarded_at is not null
       and extract(isodow from (p_now at time zone p.timezone)) = 7
       and util.minutes_since(p_now, p.timezone, v_recap_at) < 30
  loop
    if private.queue_direct(r.id, 'weekly_recap', 'recap:' || r.week, jsonb_build_object('week', r.week)) then
      v_recaps := v_recaps + 1;
    end if;
  end loop;

  -- A challenge's first day, once.
  for r in
    insert into private.challenge_start_runs (group_id, start_date)
    select g.id, g.start_date from public.groups g
     where g.archived_at is null and g.start_date = util.local_today(g.group_timezone, p_now)
    on conflict (group_id, start_date) do nothing
    returning group_id, start_date
  loop
    perform private.notify('challenge', jsonb_build_object('group', r.group_id, 'phase', 'start',
                                                            'day', r.start_date));
    v_starts := v_starts + 1;
  end loop;

  v_digests := private.send_digests(p_now);

  -- Retention (§11): notifications 90 days (their deliveries go with them),
  -- digests the same, dead jobs 30 days, old start records a year.
  delete from public.notifications where created_at < p_now - make_interval(days => util.config_int('notify_keep_days'));
  delete from private.notification_deliveries
   where notification_id is null and created_at < p_now - make_interval(days => util.config_int('notify_keep_days'));
  delete from pgmq.q_notify_dead where enqueued_at < p_now - interval '30 days';
  delete from private.challenge_start_runs where queued_at < p_now - interval '1 year';

  return jsonb_build_object('reminders', v_reminders, 'at_risk', v_at_risk, 'partner_missed', v_partner,
                            'recaps', v_recaps, 'challenge_starts', v_starts, 'digests', v_digests);
end;
$$;

-- Digests: at 19:00 local, everything waiting for the digest goes out as one
-- push and one email ("You have 4 new updates"), daily, or on Sundays for
-- weekly. Once per day or week (last_digest_on).
create or replace function private.send_digests(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
  v_at time := make_time(util.config_int('notify_digest_hour'), 0, 0);
begin
  for r in
    select s.user_id, s.digest, util.local_today(p.timezone, p_now) as today
      from public.notification_settings s
      join public.profiles p on p.id = s.user_id and p.deleted_at is null and p.deletion_requested_at is null
     where s.digest <> 'off'
       and util.minutes_since(p_now, p.timezone, v_at) < 30
       and (s.digest = 'daily' or extract(isodow from (p_now at time zone p.timezone)) = 7)
       and s.last_digest_on is distinct from util.local_today(p.timezone, p_now)
       and exists (select 1 from private.notification_deliveries d where d.user_id = s.user_id and d.status = 'digest')
     for update of s skip locked
  loop
    with bundled as (
      update private.notification_deliveries d set status = 'bundled', sent_at = p_now
       where d.user_id = r.user_id and d.status = 'digest'
      returning d.channel
    )
    insert into private.notification_deliveries (user_id, notification_id, channel, status, reason, bundle_count, created_at)
    select r.user_id, null, b.channel, 'ready', 'digest', count(*), p_now from bundled b group by b.channel;
    update public.notification_settings set last_digest_on = r.today where user_id = r.user_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.send_digests(timestamptz) from public;
revoke all on function private.notify_schedule(timestamptz) from public;

select cron.schedule('notify-schedule', '*/15 * * * *', $$select private.notify_schedule()$$);

-- A held digest (quiet hours at digest time) has no notification row: when
-- its time comes it is simply ready.
create or replace function private.release_held(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  pl record;
  v_count integer := 0;
begin
  for d in
    select x.id, x.user_id, x.channel, x.notification_id, n.type, n.group_id
      from private.notification_deliveries x
      left join public.notifications n on n.id = x.notification_id
     where x.status = 'held' and x.release_at <= p_now
     order by x.release_at
     limit 500
     for update of x skip locked
  loop
    if d.notification_id is null then
      update private.notification_deliveries set status = 'ready', release_at = null where id = d.id;
    else
      select * into pl from private.plan_channel(d.user_id, d.type, d.channel, d.group_id, p_now);
      update private.notification_deliveries
         set status = coalesce(pl.status, 'skipped'),
             reason = case when pl.status is null then 'turned_off' else pl.reason end,
             release_at = pl.release_at
       where id = d.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.release_held(timestamptz) from public;
