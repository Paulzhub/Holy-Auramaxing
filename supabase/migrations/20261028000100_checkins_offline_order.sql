-- Phase 10 (CLAUDE.md §7.5, §13; D-122): an offline check-in never replaces
-- a newer answer.
--
-- Until now, a check-in sent from the device's offline queue while its day
-- was still open became an ordinary save, and so an edit of any answer the
-- day already had. A check-in made offline at 08:00 that reached the server
-- at 11:00 would overwrite an answer given online at 10:00 on another device:
-- the older answer would win. Now, if the day already has an answer saved at
-- or after the moment the offline one was made, it is refused with
-- checkin_already_answered and the device drops it. That also makes sending
-- the same queued check-in twice a no-op ("synced exactly once").
--
-- Only this check is new; the rest of the function is unchanged (D-067).

create or replace function private.save_offline_checkin(
  p_user uuid,
  p_tz text,
  p_local_date date,
  p_recorded_at timestamptz,
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
  v_created_at timestamptz;
  v_before integer;
  v_id uuid;
  v_saved_at timestamptz;
begin
  if p_recorded_at is null or p_local_date is null then
    raise exception 'checkin_invalid';
  end if;
  select created_at into v_created_at from public.profiles where id = p_user;
  if p_recorded_at > p_now + interval '5 minutes' or p_recorded_at < v_created_at then
    raise exception 'checkin_invalid';
  end if;
  if p_recorded_at < p_now - make_interval(days => util.config_int('offline_sync_max_days')) then
    raise exception 'checkin_sync_too_old';
  end if;
  if not (p_local_date = any (util.checkin_dates(p_tz, p_recorded_at))) then
    raise exception 'checkin_window_closed';
  end if;

  -- The day already has an answer saved at or after this one was made (on
  -- another device, or an earlier send of this same item): keep the newer one.
  select greatest(c.created_at, c.updated_at) into v_saved_at
    from public.checkins c
   where c.user_id = p_user and c.local_date = p_local_date;
  if v_saved_at is not null and v_saved_at >= p_recorded_at then
    raise exception 'checkin_already_answered';
  end if;

  -- Still answerable now: exactly like answering online.
  if p_local_date = any (util.checkin_dates(p_tz, p_now)) then
    return private.save_checkin(p_user, p_tz, p_local_date, p_outcome, p_mood, p_urge_level, p_triggers,
                                p_note_encrypted, p_now);
  end if;

  if p_outcome is null or p_outcome not in ('clean', 'slipped')
     or (p_mood is not null and p_mood not between 1 and 5)
     or (p_urge_level is not null and p_urge_level not between 0 and 5) then
    raise exception 'checkin_invalid';
  end if;
  perform private.check_note(p_note_encrypted);

  v_before := (private.live_level(p_user, p_tz, p_now)).level;
  insert into public.checkins (user_id, local_date, timezone, outcome, mood, urge_level, triggers, note_encrypted)
  values (p_user, p_local_date, p_tz, p_outcome, p_mood, p_urge_level, private.clean_triggers(p_triggers),
          p_note_encrypted)
  on conflict (user_id, local_date) do nothing
  returning id into v_id;
  if v_id is null then
    -- Answered already (online, or by an earlier sync): the device drops it.
    raise exception 'checkin_already_answered';
  end if;

  perform util.audit(p_user, 'checkin.synced_late', 'checkin', v_id,
                     jsonb_build_object('local_date', p_local_date));
  perform private.after_checkin_saved(p_user, v_before, p_now);
  return 'synced_late';
end;
$$;

revoke all on function private.save_offline_checkin(uuid, text, date, timestamptz, text, integer, integer, text[], text, timestamptz) from public;
