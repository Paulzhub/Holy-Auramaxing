-- platform: privacy and discretion review 2 (docs/privacy-review-2.md,
-- D-098 to D-101). Nothing here changes what anyone sees in the app.
--
--   PR2-3  A reflection (offered only after a slip) is no longer written to
--          the security log, and the entries already there are removed.
--   PR2-5  Changing an answer pings only the groups that can see the change.
--   PR2-6  Nudges and ended partnerships are kept 90 days, and the reason a
--          partnership ended ("blocked", "closing") is no longer readable by
--          the other person.
--   PR2-7  The scheduler's run log is kept 7 days.

-- ---------------------------------------------------------------- PR2-3 the reflection isn't audited

-- Unchanged except for the last line: the audit entry ('checkin.edited',
-- {"part":"reflection"}) marked the day as a slip for anyone reading the
-- security log, platform admins included (§3: never private notes). A
-- reflection is the person's own private note, like a journal entry; a
-- changed *answer* is still audited by save_checkin (§7.5).
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
end;
$$;

revoke all on function private.save_checkin_reflection(uuid, text, date, text[], text, timestamptz) from public;

delete from public.audit_log where action = 'checkin.edited' and metadata ->> 'part' = 'reflection';

-- ---------------------------------------------------------------- PR2-5 pings follow what each group can see

-- A new check-in changes Today everywhere ("checked in: yes"). A changed
-- answer changes only what a group sees at the streak or full share level
-- (the streak, the level, the answer), or what a partner there sees. A ping
-- to a group that sees only "checked in" would tell its members, who can see
-- nothing new, that this person just changed their answer.
create or replace function private.ping_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  for v_group in
    select m.group_id
      from public.group_members m
     where m.user_id = new.user_id and m.status = 'active'
       and (tg_op = 'INSERT'
            or m.share_level <> 'checkin_only'
            or exists (select 1 from public.partnerships p
                        where p.group_id = m.group_id and p.status = 'active'
                          and new.user_id in (p.user_a, p.user_b)))
  loop
    perform private.ping_group(v_group, 'today');
  end loop;
  return null;
end;
$$;

revoke all on function private.ping_on_checkin() from public;

-- ---------------------------------------------------------------- PR2-6 partnerships: the reason stays ours

-- The two people still read their partnership (the Partner page needs
-- everything but the reason). Why it ended is ours: "blocked" or "closing"
-- would tell one person that the other blocked them or is deleting their
-- account.
revoke select on table public.partnerships from authenticated;
grant select (id, group_id, user_a, user_b, status, a_allows_alerts, b_allows_alerts, requested_at, accepted_at, ended_at)
  on table public.partnerships to authenticated;

-- ---------------------------------------------------------------- PR2-6, PR2-7 retention

insert into private.app_config (key, value, description) values
  ('social_keep_days', 90, 'Days a nudge, or a partnership after it ended, is kept (§11 retention, D-100).'),
  ('cron_log_keep_days', 7, 'Days the scheduler''s run log is kept (D-100).');

-- Daily. Nudges are only needed for "once a day" and the recent list, yet a
-- "please pray for me" nudge from the slip page dates a slip; ended
-- partnerships aren't shown anywhere; the scheduler logs a row for every
-- run (about 25,000 a day) and nobody reads old ones.
create or replace function private.privacy_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep interval := make_interval(days => util.config_int('social_keep_days'));
  v_nudges integer;
  v_partnerships integer;
  v_runs integer;
begin
  delete from public.nudges where created_at < p_now - v_keep;
  get diagnostics v_nudges = row_count;
  delete from public.partnerships where status = 'ended' and ended_at < p_now - v_keep;
  get diagnostics v_partnerships = row_count;
  delete from cron.job_run_details
   where coalesce(end_time, start_time) < p_now - make_interval(days => util.config_int('cron_log_keep_days'));
  get diagnostics v_runs = row_count;
  return jsonb_build_object('nudges', v_nudges, 'partnerships', v_partnerships, 'scheduler_runs', v_runs);
end;
$$;

revoke all on function private.privacy_retention(timestamptz) from public;

select cron.schedule('privacy-retention', '41 3 * * *', $$select private.privacy_retention()$$);
