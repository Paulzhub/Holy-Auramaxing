-- checkins: what a group sees of its members' check-ins today (CLAUDE.md §6,
-- §7.4). See D-044.
--
-- public.group_checkins_today runs with its owner's rights (a security-definer
-- view: no security_invoker), so it can read check-ins that RLS hides from
-- everyone but their author. It then applies, column by column, the share
-- level each member chose IN THAT GROUP:
--
--   checkin_only  checked in today: yes / no
--   streak        + the current streak
--   full          + today's outcome
--   partner       + mood, urge level and triggers (an active accountability
--                   partner, Phase 6; util.are_partners() is false until then)
--
-- A person always sees all of their own row. Rows exist only for groups the
-- viewer is an active member of, and only for active members whose accounts
-- aren't closing (D-033). "Today" is each member's own today (§5).
-- security_barrier stops a viewer's own filters from running before these
-- rules. Phase 5 adds the level here, shown only at streak or full (§7.6).

create view public.group_checkins_today
with (security_barrier = true)
as
select
  m.group_id,
  m.user_id,
  (c.id is not null) as checked_in_today,
  case when v.rank >= 1 then util.live_count(s.current_streak, s.last_checkin_date, p.timezone) end as current_streak,
  case when v.rank >= 2 then c.outcome end as outcome,
  case when v.rank >= 3 then c.mood end as mood,
  case when v.rank >= 3 then c.urge_level end as urge_level,
  case when v.rank >= 3 then c.triggers end as triggers
from public.group_members m
join public.profiles p
  on p.id = m.user_id and p.deleted_at is null and p.deletion_requested_at is null
left join public.checkins c
  on c.user_id = m.user_id and c.local_date = util.local_today(p.timezone)
left join public.user_stats s
  on s.user_id = m.user_id
cross join lateral (
  select case
    when m.user_id = auth.uid() or util.are_partners(auth.uid(), m.user_id) then 3
    else util.share_rank(m.share_level)
  end as rank
) v
where m.status = 'active'
  and util.session_ok()
  and m.group_id in (
    select me.group_id from public.group_members me
     where me.user_id = auth.uid() and me.status = 'active'
  );

comment on view public.group_checkins_today is
  'Members'' check-ins today, filtered by each member''s share level in that group (§6). The only way a group sees check-ins.';

revoke all on public.group_checkins_today from anon, authenticated;
grant select on public.group_checkins_today to authenticated;
