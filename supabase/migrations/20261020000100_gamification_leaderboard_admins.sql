-- Phase 7a (D-088): owners and admins see who is hidden on the leaderboard.
--
-- A member who chose to hide (while the covenant allows it) keeps their place
-- without a name for other members, as before (D-074). The group's owners and
-- admins now get the member's id (and so the name, through profile_cards),
-- still marked is_hidden, so the page can say "Hidden from members". A block
-- either way still hides the name from everyone, admins included (D-078).
-- Members never receive the id, through the page or the API.

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
  v_admin boolean;
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
  select m.role in ('owner', 'admin') into v_admin from public.group_members m
   where m.group_id = p_group and m.user_id = v_uid and m.status = 'active';
  v_week := util.week_start(util.local_today(g.group_timezone, v_now));

  return query
  with eligible as (
    select e.*, (m.leaderboard_hidden and g.leaderboard_hiding_allowed) as chose_hidden,
           util.blocked_between(v_uid, e.user_id) as blocked,
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
    select el.user_id, (el.chose_hidden or el.blocked) as hidden,
           -- Owners and admins see who chose to hide (D-088); a block hides the name from everyone.
           (el.user_id = v_uid or (el.chose_hidden and not el.blocked and v_admin)
            or not (el.chose_hidden or el.blocked)) as named,
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
         case when r.named then r.user_id end,
         coalesce(r.v, 0),
         r.user_id = v_uid,
         r.hidden
    from ranked r
   where (r.rk > p_after and r.rk <= p_after + p_limit) or r.user_id = v_uid
   order by r.rk;
end;
$$;
