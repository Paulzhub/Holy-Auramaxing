-- groups: tidy-up for the SQL linter (CI's "Lint SQL" step). Seven group
-- functions from Phase 3 declared a row variable `g` and read the group into
-- it without ever using it ("never read variable"). They are recreated here
-- unchanged apart from dropping that variable; behaviour is identical (each
-- later `found` check follows its own statement). Grants are kept by
-- create or replace.

create or replace function public.decline_covenant_change(p_proposal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  l record;
begin
  select group_id into v_group from public.group_covenant_proposals where id = p_proposal;
  select * into l from private.lock_group(v_group, 'member');
  if l.my_role = 'owner' then raise exception 'group_forbidden' using errcode = '42501'; end if;
  update public.group_covenant_proposals set closed_at = now(), outcome = 'declined'
   where id = p_proposal and closed_at is null;
  if not found then raise exception 'proposal_closed'; end if;
  perform private.group_audit(l.caller_id, 'group.covenant_declined', v_group);
end;
$$;

create or replace function public.withdraw_covenant_change(p_proposal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  l record;
begin
  select group_id into v_group from public.group_covenant_proposals where id = p_proposal;
  select * into l from private.lock_group(v_group, 'owner');
  update public.group_covenant_proposals set closed_at = now(), outcome = 'withdrawn'
   where id = p_proposal and closed_at is null;
  if not found then raise exception 'proposal_closed'; end if;
  perform private.group_audit(l.caller_id, 'group.covenant_withdrawn', v_group);
end;
$$;

create or replace function public.agree_to_covenant_change(p_proposal uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  l record;
begin
  select group_id into v_group from public.group_covenant_proposals where id = p_proposal;
  select * into l from private.lock_group(v_group, 'member');
  if not exists (select 1 from public.group_covenant_proposals
                  where id = p_proposal and closed_at is null and expires_at > now()) then
    raise exception 'proposal_closed';
  end if;
  if l.my_role = 'owner' then raise exception 'group_forbidden' using errcode = '42501'; end if;
  insert into public.group_covenant_agreements (proposal_id, group_id, user_id)
  values (p_proposal, v_group, l.caller_id)
  on conflict do nothing;
  perform private.group_audit(l.caller_id, 'group.covenant_agreed', v_group);
  return private.try_apply_covenant(v_group);
end;
$$;

create or replace function public.transfer_group_ownership(p_group uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select * into l from private.lock_group(p_group, 'owner');
  if p_new_owner = l.caller_id then raise exception 'cannot_target_self'; end if;
  if not exists (select 1 from public.group_members m
                  where m.group_id = p_group and m.user_id = p_new_owner and m.status = 'active')
     or not util.account_open(p_new_owner) then
    raise exception 'target_not_member';
  end if;
  update public.group_members set role = 'admin' where group_id = p_group and user_id = l.caller_id;
  update public.group_members set role = 'owner' where group_id = p_group and user_id = p_new_owner;
  update public.groups set owner_id = p_new_owner where id = p_group;
  -- A proposal belongs to the owner who made it.
  update public.group_covenant_proposals set closed_at = now(), outcome = 'withdrawn'
   where group_id = p_group and closed_at is null;
  perform private.group_audit(l.caller_id, 'group.ownership_transferred', p_group, p_new_owner);
end;
$$;

create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  v_role text;
begin
  select * into l from private.lock_group(p_group, 'admin');
  if p_user = l.caller_id then raise exception 'cannot_target_self'; end if;
  select role into v_role from public.group_members
   where group_id = p_group and user_id = p_user and status = 'active' for update;
  if v_role is null then raise exception 'target_not_member'; end if;
  if v_role = 'owner' or (v_role = 'admin' and l.my_role <> 'owner') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  update public.group_members
     set status = 'removed', role = 'member', leaderboard_hidden = false
   where group_id = p_group and user_id = p_user;
  delete from public.group_covenant_agreements a
   using public.group_covenant_proposals p
   where a.proposal_id = p.id and p.group_id = p_group and a.user_id = p_user;
  perform private.group_audit(l.caller_id, 'group.member_removed', p_group, p_user);
  perform private.try_apply_covenant(p_group);
end;
$$;

create or replace function public.allow_group_member_back(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select * into l from private.lock_group(p_group, 'admin');
  delete from public.group_members where group_id = p_group and user_id = p_user and status = 'removed';
  if not found then raise exception 'target_not_member'; end if;
  perform private.group_audit(l.caller_id, 'group.member_readmitted', p_group, p_user);
end;
$$;

create or replace function public.decline_join_request(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select * into l from private.lock_group(p_group, 'admin');
  delete from public.group_members where group_id = p_group and user_id = p_user and status = 'pending';
  if not found then raise exception 'target_not_member'; end if;
  perform private.group_audit(l.caller_id, 'group.join_declined', p_group, p_user);
end;
$$;
