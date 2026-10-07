-- groups: what happens to someone's group life when their account is erased
-- (D-033, D-040), plus the group-pictures bucket.

-- ---------------------------------------------------------------- pictures

-- Same rules as avatars (D-026, D-036): private, WebP only, no user policies.
-- Only the app's server writes, and pictures are served through
-- /api/group-picture/<id> after a membership check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-pictures', 'group-pictures', false, 1048576, array['image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Deleted groups' picture folders go through the same purge queue.
alter table private.storage_purge_queue drop constraint storage_purge_queue_bucket_check;
alter table private.storage_purge_queue
  add constraint storage_purge_queue_bucket_check check (bucket in ('avatars', 'group-pictures'));

-- ---------------------------------------------------------------- erasure

-- Called by private.erase_account() before the auth user is deleted:
--   * a group the person owns passes to its longest-serving admin, else its
--     longest-serving member (open accounts first); with nobody else in it,
--     the group is deleted rather than archived, since no one could ever see
--     it again (D-040);
--   * their memberships, requests, covenant agreements and the invites they
--     created are deleted; open covenant changes are re-checked, in case they
--     were the last one who hadn't agreed;
--   * Phase 5 (posts, comments, reactions) and Phase 6 (nudges, partnerships)
--     add their part below: posts and comments stay with author_id set to
--     null ("A former member"); reactions, nudges and partnerships go.
create or replace function private.anonymise_group_contributions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_next uuid;
  v_groups uuid[];
begin
  for v_group in
    select g.id from public.groups g where g.owner_id = p_user_id order by g.id for update
  loop
    select m.user_id into v_next
      from public.group_members m
     where m.group_id = v_group and m.user_id <> p_user_id and m.status = 'active'
     order by util.account_open(m.user_id) desc, (m.role = 'admin') desc, m.joined_at, m.user_id
     limit 1;
    if v_next is null then
      perform private.delete_group_now(v_group, null, 'owner_account_erased');
    else
      update public.group_members set role = 'member' where group_id = v_group and user_id = p_user_id;
      update public.group_members set role = 'owner' where group_id = v_group and user_id = v_next;
      update public.groups set owner_id = v_next where id = v_group;
      update public.group_covenant_proposals set closed_at = now(), outcome = 'withdrawn'
       where group_id = v_group and closed_at is null;
      perform private.group_audit(null, 'group.ownership_transferred', v_group, v_next,
                                  '{"reason":"owner_account_erased"}');
    end if;
  end loop;

  delete from public.group_invites where created_by = p_user_id;
  delete from public.group_covenant_agreements where user_id = p_user_id;
  update public.group_covenant_proposals set proposed_by = null where proposed_by = p_user_id;

  with gone as (
    delete from public.group_members where user_id = p_user_id returning group_id
  )
  select array_agg(group_id) into v_groups from gone;

  if v_groups is not null then
    foreach v_group in array v_groups loop
      perform private.try_apply_covenant(v_group);
    end loop;
  end if;

  -- Phase 5: update public.posts set author_id = null where author_id = p_user_id; (and comments)
  --          delete from public.reactions where user_id = p_user_id;
  -- Phase 6: delete from public.nudges where p_user_id in (from_user, to_user);
  --          delete from public.partnerships where p_user_id in (user_a, user_b);
end;
$$;

revoke all on function private.anonymise_group_contributions(uuid) from public;
