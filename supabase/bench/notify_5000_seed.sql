-- Notification fan-out check (CLAUDE.md §7.8, §14; D-092): 5,000 members in
-- one group, committed so the worker and the app can see them. Used by
-- `npm run bench:notify` (scripts/bench-notify.mjs), which removes them after.
-- Runs through psql as the database's superuser (triggers off while seeding).
-- :owner is the e2e shared member (the account whose pages are timed).
set session_replication_role = replica;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
select ('00000000-0000-7000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'bench-notify-' || i || '@example.test', now(), now(), now()
  from generate_series(1, 5000) i
on conflict do nothing;
insert into public.profiles (id, handle, display_name, timezone, adult_confirmed_at, onboarded_at, created_at)
select ('00000000-0000-7000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, 'bench_' || i, 'Bench ' || i,
       'Asia/Kolkata', now(), now(), now() - interval '90 days'
  from generate_series(1, 5000) i
on conflict do nothing;
insert into public.privacy_settings (user_id)
select ('00000000-0000-7000-8000-' || lpad(to_hex(i), 12, '0'))::uuid from generate_series(1, 5000) i
on conflict do nothing;
insert into public.notification_settings (user_id, quiet_hours_start, quiet_hours_end)
select ('00000000-0000-7000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, '00:00', '00:00' from generate_series(1, 5000) i
on conflict do nothing;
insert into public.groups (id, name, slug, owner_id, challenge_type, start_date, group_timezone, covenant_text)
values ('00000000-0000-7000-8000-0000000b7000', 'Bench notify group', 'bench-notify-group', :'owner',
        'ongoing', current_date - 10, 'Asia/Kolkata', 'A covenant for the bench.')
on conflict do nothing;
insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
select '00000000-0000-7000-8000-0000000b7000', ('00000000-0000-7000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       'member', 'active', 'checkin_only', now(), now() - interval '9 days'
  from generate_series(1, 5000) i
on conflict do nothing;
insert into public.group_members (group_id, user_id, role, status, share_level, covenant_accepted_at, joined_at)
values ('00000000-0000-7000-8000-0000000b7000', :'owner', 'owner', 'active', 'full', now(), now() - interval '9 days')
on conflict do nothing;
set session_replication_role = origin;
