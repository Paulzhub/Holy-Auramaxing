-- profile: avatars (CLAUDE.md §7.3, §10). See docs/decisions.md D-026.
--
-- Photos live in a private Storage bucket that no user can read or write
-- directly. The app's server is the only writer: it checks, re-encodes and
-- strips the photo, stores it under a random name, has it screened, and only
-- then makes it the live avatar. Other people fetch avatars through the app
-- (/api/avatar/<id>), which checks public.profile_cards first.
--
--   profiles.avatar_path          the live, screened avatar (null = initials)
--   profiles.avatar_pending_path  a new photo waiting for screening; the old
--                                 avatar stays live meanwhile
--   profiles.avatar_status        what happened to the latest upload

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are created for this bucket, so RLS denies
-- every read and write by anon and authenticated users. Only the service
-- role (the app's server) touches these files.

alter table public.profiles
  add column avatar_pending_path text
    check (avatar_pending_path is null or char_length(avatar_pending_path) <= 200);

-- Both paths are "<user id>/<random name>", so a path can never point into
-- someone else's folder.
alter table public.profiles
  add constraint profiles_avatar_path_owner check (
    (avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{16,64}$'))
    and (avatar_pending_path is null or avatar_pending_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{16,64}$'))
  );

-- 'processing' was never used; uploads are re-encoded before the row changes.
update public.profiles set avatar_status = 'none' where avatar_status = 'processing';
alter table public.profiles drop constraint profiles_avatar_status_check;
alter table public.profiles
  add constraint profiles_avatar_status_check
    check (avatar_status in ('none', 'pending_review', 'ready', 'rejected'));

comment on column public.profiles.avatar_path is
  'The live avatar ("<user id>/<random>"); only ever set after screening passes. Written by the server only.';
comment on column public.profiles.avatar_pending_path is
  'A new avatar waiting for screening. Never shown to other people. Written by the server only.';

-- avatar_path now only ever holds a screened photo, so the card shows it
-- whenever it is set (an older avatar stays visible while a new one is
-- checked). Same filtering as before for every other field.
create or replace view public.profile_cards
with (security_barrier = true)
as
select
  p.id,
  p.handle,
  p.display_name,
  p.avatar_path,
  case when util.can_see(auth.uid(), p.id, s.bio_visibility) then p.bio end as bio,
  case when util.can_see(auth.uid(), p.id, s.testimony_visibility) then p.testimony end as testimony,
  case when util.can_see(auth.uid(), p.id, s.verse_visibility) then p.favourite_verse end as favourite_verse,
  p.created_at as joined_at
from public.profiles p
join public.privacy_settings s on s.user_id = p.id
where p.deleted_at is null
  and p.deletion_requested_at is null
  and util.can_see(auth.uid(), p.id, s.profile_visibility);

revoke all on table public.profile_cards from anon, authenticated;
grant select on table public.profile_cards to authenticated;
