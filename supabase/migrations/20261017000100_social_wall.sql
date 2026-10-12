-- social: the encouragement wall, reactions, report and block, and the
-- automatic filter (CLAUDE.md §7.7, §7.11, §10). Phase 6a; see D-077 to D-081.
--
-- Everything is written through functions (no write grants), each of which
-- checks the caller's active membership in the group the row belongs to, is
-- throttled inside the database (D-051), and runs the content filter on any
-- text. Reads go through functions that apply blocks and closing accounts
-- per viewer, and through RLS on the tables themselves.
--
-- A block works both ways (D-078): neither person sees the other's profile,
-- posts, comments, reactions, check-in row or name on a board, and neither
-- can react to or comment on the other's things. Group admins still see a
-- blocked member's membership row (they may need to remove them), with no
-- name or photo.

-- ---------------------------------------------------------------- config

insert into private.app_config (key, value, description) values
  ('badge_encourager_count', 50,
   'Encouragements given to others (reactions, comments, nudges) for the Encourager badge (owner, 2026-10-12).'),
  ('badge_prayer_warrior_count', 10,
   'Prayer requests prayed for ("I prayed") for the Prayer Warrior badge (owner, 2026-10-12).'),
  ('wall_pinned_max', 3, 'Announcements a group can have pinned at once.');

-- ---------------------------------------------------------------- blocks

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

comment on table public.blocks is
  'Who blocked whom (§7.11, D-078). A block works both ways. Only the blocker reads their rows; written by block_member / unblock_member.';

alter table public.blocks enable row level security;
revoke all on table public.blocks from anon, authenticated;
grant select on table public.blocks to authenticated;

create policy "blocks: the blocker reads" on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "blocks: live, verified session" on public.blocks
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- Has either person blocked the other?
create or replace function util.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.blocks k
     where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a)
  );
$$;

-- Everyone the person has blocked or been blocked by, for filtering a page in one go.
create or replace function util.block_set(p_user uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x), '{}') from (
    select k.blocked_id as x from public.blocks k where k.blocker_id = p_user
    union
    select k.blocker_id from public.blocks k where k.blocked_id = p_user
  ) s;
$$;

revoke all on function util.blocked_between(uuid, uuid) from public, anon;
revoke all on function util.block_set(uuid) from public, anon;
grant execute on function util.blocked_between(uuid, uuid) to authenticated, service_role;
grant execute on function util.block_set(uuid) to authenticated, service_role;

-- Profile cards close between two people once either blocks the other.
create or replace function util.can_see(viewer uuid, owner uuid, visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and util.session_ok() and (
    viewer = owner
    or (not util.blocked_between(viewer, owner) and (
      (visibility = 'groups' and (util.shares_group(viewer, owner) or util.are_partners(viewer, owner)))
      or (visibility = 'partners' and util.are_partners(viewer, owner))
    ))
  );
$$;

-- Members no longer see a blocked (or blocking) member's row. Admins still do,
-- without a name, so they can manage the group.
drop policy "group_members: members read their group" on public.group_members;
create policy "group_members: members read their group"
  on public.group_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      util.account_open(user_id)
      and (
        (status = 'active' and util.is_active_member(group_id)
         and not util.blocked_between((select auth.uid()), user_id))
        or util.is_group_admin(group_id)
      )
    )
  );

-- ---------------------------------------------------------------- the filter

-- Slurs are refused anywhere in a post or comment. Links are allowed as plain
-- text (never made clickable), unless they point at an explicit site (D-080).
-- Words about the struggle itself are allowed: this is a recovery app.
create table private.content_filter_terms (
  term text not null check (term ~ '^[a-z0-9.-]{2,60}$'),
  kind text not null check (kind in ('slur', 'domain', 'tld', 'link_word')),
  primary key (kind, term)
);

comment on table private.content_filter_terms is
  'The automatic filter for posts and comments (§7.11, D-080). Change with a migration.';

insert into private.content_filter_terms (term, kind) values
  -- Slurs (English and common Indian-English usage). Kept short and specific
  -- to avoid refusing ordinary words.
  ('nigger', 'slur'), ('nigga', 'slur'), ('faggot', 'slur'),
  ('fag', 'slur'), ('fagot', 'slur'), ('dyke', 'slur'), ('tranny', 'slur'),
  ('retard', 'slur'), ('retarded', 'slur'), ('spastic', 'slur'), ('spaz', 'slur'),
  ('kike', 'slur'), ('chink', 'slur'), ('gook', 'slur'), ('wetback', 'slur'),
  ('spic', 'slur'), ('coon', 'slur'), ('paki', 'slur'), ('raghead', 'slur'),
  ('towelhead', 'slur'), ('sandnigger', 'slur'), ('beaner', 'slur'),
  ('chamar', 'slur'), ('bhangi', 'slur'), ('chinki', 'slur'), ('katua', 'slur'),
  ('slut', 'slur'), ('cunt', 'slur'),
  -- Explicit sites (the domain and every subdomain).
  ('pornhub.com', 'domain'), ('xvideos.com', 'domain'), ('xnxx.com', 'domain'),
  ('xhamster.com', 'domain'), ('redtube.com', 'domain'), ('youporn.com', 'domain'),
  ('tube8.com', 'domain'), ('spankbang.com', 'domain'), ('eporner.com', 'domain'),
  ('brazzers.com', 'domain'), ('onlyfans.com', 'domain'), ('fansly.com', 'domain'),
  ('chaturbate.com', 'domain'), ('stripchat.com', 'domain'), ('livejasmin.com', 'domain'),
  ('bongacams.com', 'domain'), ('cam4.com', 'domain'), ('motherless.com', 'domain'),
  ('nhentai.net', 'domain'), ('e-hentai.org', 'domain'), ('hentaihaven.xxx', 'domain'),
  ('rule34.xxx', 'domain'), ('xxxbunker.com', 'domain'), ('beeg.com', 'domain'),
  ('porntrex.com', 'domain'), ('hqporner.com', 'domain'), ('txxx.com', 'domain'),
  -- Whole top-level domains.
  ('xxx', 'tld'), ('porn', 'tld'), ('sex', 'tld'), ('adult', 'tld'),
  ('sexy', 'tld'),
  -- Words that mark a link as explicit wherever they appear in it as a whole
  -- part ("covenanteyes.com/porn-addiction" stays allowed: help is allowed).
  ('xxx', 'link_word'), ('hentai', 'link_word'), ('nsfw', 'link_word'),
  ('onlyfans', 'link_word'), ('camgirl', 'link_word'), ('camgirls', 'link_word'),
  ('nudes', 'link_word'), ('xvideos', 'link_word'), ('pornhub', 'link_word');

-- Lower case, compatibility forms folded (full-width letters, ligatures),
-- accents and invisible characters removed.
create or replace function util.filter_fold(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(normalize(lower(normalize(coalesce(p, ''), NFKC)), NFKD), '[\u0300-\u036f]', '', 'g'),
           '[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]', '', 'g');
$$;

-- Which kind of term the text trips, if any: 'slur' or 'link'. Null when clean.
create or replace function util.filter_match(p text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fold text := util.filter_fold(p);
  v_words text;
  v_joined text;
  v_link text;
  v_host text;
begin
  -- Look-alike characters, then words of letters only. A slur matches as a
  -- whole word, with any letter repeated ("sluuur"), and also when spelled
  -- out in single letters ("s l u r"). Each term's letters become `x+`, so a
  -- doubled letter in the term must stay doubled (no clash with place names).
  v_words := regexp_replace(translate(v_fold, '0134578@$!|', 'oieastbasii'), '[^a-z]+', ' ', 'g');
  v_joined := regexp_replace(v_words, '\m([a-z]) (?=[a-z]\M)', '\1', 'g');
  if exists (
    select 1 from private.content_filter_terms t
     where t.kind = 'slur'
       and (v_words ~ ('\m' || regexp_replace(t.term, '([a-z])', '\1+', 'g') || '\M')
            or v_joined ~ ('\m' || regexp_replace(t.term, '([a-z])', '\1+', 'g') || '\M'))
  ) then
    return 'slur';
  end if;

  -- Links: anything that looks like a host name, with or without a scheme.
  for v_link in
    select m[1] from regexp_matches(v_fold, '((?:https?://)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#][^\s]*)?)', 'g') as m
  loop
    v_host := substring(v_link from '^(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})');
    if exists (
      select 1 from private.content_filter_terms t
       where (t.kind = 'domain' and (v_host = t.term or right(v_host, length(t.term) + 1) = '.' || t.term))
          or (t.kind = 'tld' and right(v_host, length(t.term) + 1) = '.' || t.term)
          or (t.kind = 'link_word' and t.term = any(regexp_split_to_array(v_link, '[^a-z0-9]+')))
    ) then
      return 'link';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function util.filter_fold(text) from public, anon;
revoke all on function util.filter_match(text) from public, anon;
grant execute on function util.filter_fold(text) to authenticated, service_role;
grant execute on function util.filter_match(text) to authenticated, service_role;

-- Tidies text for storing and refuses what the filter catches. Line breaks are
-- kept; other control characters go. Errors: invalid_input (empty or too
-- long), content_blocked (the filter).
create or replace function private.clean_social_text(p text, p_max integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  v := btrim(regexp_replace(replace(coalesce(p, ''), E'\r\n', E'\n'),
                            '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f\u2028\u2029]', '', 'g'), E' \n\t');
  v := regexp_replace(v, E'\n{3,}', E'\n\n', 'g');
  if v = '' or char_length(v) > p_max then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if util.filter_match(v) is not null then
    raise exception 'content_blocked' using errcode = '22023', hint = util.filter_match(v);
  end if;
  return v;
end;
$$;

revoke all on function private.clean_social_text(text, integer) from public;

-- ---------------------------------------------------------------- posts and comments

create table public.posts (
  id uuid primary key default util.uuid_v7(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Null once the author's account is erased ("A former member").
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('encouragement', 'prayer_request', 'testimony', 'announcement', 'milestone')),
  body text check (body is null or char_length(body) between 1 and 2000),
  -- Milestone cards (Phase 6b) carry the badge instead of text.
  badge text references public.badges (slug),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  -- Removed by a group admin rather than by its author.
  removed_by_admin boolean not null default false,
  check ((kind = 'milestone') = (badge is not null)),
  check (kind = 'milestone' or deleted_at is not null or body is not null),
  check (deleted_at is null or body is null),
  check (not pinned or (kind = 'announcement' and deleted_at is null))
);

create index posts_group_feed_idx on public.posts (group_id, id desc) where deleted_at is null;
create index posts_group_pinned_idx on public.posts (group_id) where pinned;
create index posts_author_idx on public.posts (author_id);

comment on table public.posts is
  'The encouragement wall (§7.7, D-077). Plain text only. Members read their group''s posts through RLS or group_wall(); written only by the wall functions.';

create table public.comments (
  id uuid primary key default util.uuid_v7(),
  post_id uuid not null references public.posts (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text check (body is null or char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  removed_by_admin boolean not null default false,
  check ((deleted_at is null) = (body is not null))
);

create index comments_post_idx on public.comments (post_id, id) where deleted_at is null;
create index comments_group_idx on public.comments (group_id);
create index comments_author_idx on public.comments (author_id);

comment on table public.comments is
  'One level of comments on wall posts (§7.7). Written only by the wall functions.';

create table public.reactions (
  id uuid primary key default util.uuid_v7(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Check-in reactions arrive in Phase 6b.
  target_type text not null check (target_type in ('post', 'comment', 'checkin')),
  target_id uuid not null,
  kind text not null check (kind in ('pray', 'heart', 'fire', 'strong', 'dove')),
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id, kind)
);

create index reactions_target_idx on public.reactions (target_type, target_id);
create index reactions_group_idx on public.reactions (group_id);

comment on table public.reactions is
  'Reactions (§7.7). "I prayed" is the pray reaction on a prayer request. Written only by set_reaction().';

-- ---------------------------------------------------------------- reports

create table public.reports (
  id uuid primary key default util.uuid_v7(),
  group_id uuid not null references public.groups (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'member')),
  target_id uuid not null,
  -- Whose post, comment or account it is.
  subject_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('unkind', 'sexual', 'hateful', 'spam', 'unsafe', 'other')),
  note text check (note is null or char_length(note) between 1 and 500),
  -- The text as it was when reported, so an edit or delete can't hide it.
  -- Cleared when the report is resolved.
  snapshot text check (snapshot is null or char_length(snapshot) <= 2000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  check ((status = 'open') = (resolved_at is null))
);

create index reports_group_open_idx on public.reports (group_id, created_at) where status = 'open';
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_subject_idx on public.reports (subject_id);
create unique index reports_one_open_idx on public.reports (reporter_id, target_type, target_id) where status = 'open';

comment on table public.reports is
  'Reports for the group''s admins (§7.11, D-079). Admins never see who reported. The platform queue comes in Phase 12.';

-- ---------------------------------------------------------------- RLS

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;
revoke all on table public.posts, public.comments, public.reactions, public.reports from anon, authenticated;
grant select on table public.posts, public.comments, public.reactions to authenticated;
-- Who reported, and which admin resolved it, are never readable.
grant select (id, group_id, target_type, target_id, subject_id, reason, note, status, created_at, resolved_at)
  on table public.reports to authenticated;

create policy "posts: members read" on public.posts
  for select to authenticated
  using (
    util.group_status(group_id) = 'active' and deleted_at is null
    and (author_id is null or (util.account_open(author_id)
                               and not util.blocked_between((select auth.uid()), author_id)))
  );
create policy "comments: members read" on public.comments
  for select to authenticated
  using (
    util.group_status(group_id) = 'active' and deleted_at is null
    and (author_id is null or (util.account_open(author_id)
                               and not util.blocked_between((select auth.uid()), author_id)))
  );
create policy "reactions: members read" on public.reactions
  for select to authenticated
  using (
    util.group_status(group_id) = 'active' and util.account_open(user_id)
    and not util.blocked_between((select auth.uid()), user_id)
  );
-- The reporter sees their own reports; admins see their group's, except
-- reports about themselves.
create policy "reports: reporter and admins read" on public.reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or (util.is_group_admin(group_id) and subject_id is distinct from (select auth.uid()))
  );

create policy "posts: live, verified session" on public.posts
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "comments: live, verified session" on public.comments
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "reactions: live, verified session" on public.reactions
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
create policy "reports: live, verified session" on public.reports
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- ---------------------------------------------------------------- helpers

-- The caller, checked as an active member of the group. For writes, also:
-- an open account and a group that isn't archived.
create or replace function private.social_member(p_group uuid, p_write boolean, out caller_id uuid, out my_role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_archived timestamptz;
begin
  caller_id := private.caller();
  select m.role into my_role from public.group_members m
   where m.group_id = p_group and m.user_id = caller_id and m.status = 'active';
  if my_role is null then
    raise exception 'group_not_found' using errcode = '42501';
  end if;
  if p_write then
    if not util.account_open(caller_id) then
      raise exception 'account_closing' using errcode = '42501';
    end if;
    select g.archived_at into v_archived from public.groups g where g.id = p_group;
    if v_archived is not null then
      raise exception 'group_archived';
    end if;
  end if;
end;
$$;

revoke all on function private.social_member(uuid, boolean) from public;

-- A post the caller can see: their group's, not deleted, its author not
-- blocked either way and not closing. Anything else is post_not_found
-- (42501), the same answer as a post in another group.
create or replace function private.visible_post(p_post uuid, p_caller uuid)
returns public.posts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.posts;
begin
  select * into p from public.posts where id = p_post;
  if p.id is null or p.deleted_at is not null
     or not exists (select 1 from public.group_members m
                     where m.group_id = p.group_id and m.user_id = p_caller and m.status = 'active')
     or (p.author_id is not null and (not util.account_open(p.author_id)
                                      or util.blocked_between(p_caller, p.author_id))) then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  return p;
end;
$$;

create or replace function private.visible_comment(p_comment uuid, p_caller uuid)
returns public.comments
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.comments;
begin
  select * into c from public.comments where id = p_comment;
  if c.id is null or c.deleted_at is not null
     or (c.author_id is not null and (not util.account_open(c.author_id)
                                      or util.blocked_between(p_caller, c.author_id))) then
    raise exception 'comment_not_found' using errcode = '42501';
  end if;
  begin
    perform private.visible_post(c.post_id, p_caller);
  exception when insufficient_privilege then
    raise exception 'comment_not_found' using errcode = '42501';
  end;
  return c;
end;
$$;

revoke all on function private.visible_post(uuid, uuid) from public;
revoke all on function private.visible_comment(uuid, uuid) from public;

-- Social badges (D-072, owner 2026-10-12): First Testimony on the first
-- testimony; Prayer Warrior after praying for 10 other people's prayer
-- requests; Encourager after 50 encouragements given to others (reactions on
-- their posts and comments, comments on their posts; nudges from Phase 6b).
create or replace function private.award_social_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_given bigint;
  v_prayed bigint;
begin
  if exists (select 1 from public.posts p where p.author_id = p_user and p.kind = 'testimony') then
    insert into public.user_badges (user_id, badge) values (p_user, 'first_testimony')
    on conflict (user_id, badge) do nothing;
  end if;

  select count(distinct p.id) into v_prayed
    from public.reactions r
    join public.posts p on p.id = r.target_id
   where r.user_id = p_user and r.target_type = 'post' and r.kind = 'pray'
     and p.kind = 'prayer_request' and p.author_id is distinct from p_user;
  if v_prayed >= util.config_int('badge_prayer_warrior_count') then
    insert into public.user_badges (user_id, badge) values (p_user, 'prayer_warrior')
    on conflict (user_id, badge) do nothing;
  end if;

  select
    (select count(*) from public.reactions r
       left join public.posts p on r.target_type = 'post' and p.id = r.target_id
       left join public.comments c on r.target_type = 'comment' and c.id = r.target_id
      where r.user_id = p_user and coalesce(p.author_id, c.author_id) is distinct from p_user)
    + (select count(*) from public.comments c
         join public.posts p on p.id = c.post_id
        where c.author_id = p_user and c.deleted_at is null and p.author_id is distinct from p_user)
    into v_given;
  if v_given >= util.config_int('badge_encourager_count') then
    insert into public.user_badges (user_id, badge) values (p_user, 'encourager')
    on conflict (user_id, badge) do nothing;
  end if;
end;
$$;

revoke all on function private.award_social_badges(uuid) from public;

-- Encouragement XP for something done for someone else (D-071: +1, at most
-- 10 a day), on that group's Encourager board. One key per target, so taking
-- a reaction back and giving it again never pays twice.
create or replace function private.queue_encouragement(p_user uuid, p_group uuid, p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.enqueue('encouragement', jsonb_build_object(
    'user', p_user, 'key', p_key, 'group', p_group, 'at', now()));
$$;

revoke all on function private.queue_encouragement(uuid, uuid, text) from public;

-- ---------------------------------------------------------------- posts

create or replace function public.create_post(p_group uuid, p_kind text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_body text;
  v_id uuid;
begin
  select * into c from private.social_member(p_group, true);
  if p_kind is null or p_kind not in ('encouragement', 'prayer_request', 'testimony', 'announcement') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_kind = 'announcement' and c.my_role not in ('owner', 'admin') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  v_body := private.clean_social_text(p_body, 2000);
  perform private.throttle(c.caller_id, 'post_write', 25, interval '1 hour');
  insert into public.posts (group_id, author_id, kind, body)
  values (p_group, c.caller_id, p_kind, v_body)
  returning id into v_id;
  if p_kind = 'testimony' then
    perform private.enqueue('social', jsonb_build_object('user', c.caller_id));
  end if;
  return v_id;
end;
$$;

create or replace function public.edit_post(p_post uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.posts;
  v_body text;
begin
  p := private.visible_post(p_post, v_uid);
  perform private.social_member(p.group_id, true);
  if p.author_id is distinct from v_uid or p.kind = 'milestone' then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  v_body := private.clean_social_text(p_body, 2000);
  perform private.throttle(v_uid, 'post_write', 25, interval '1 hour');
  if v_body is distinct from p.body then
    update public.posts set body = v_body, edited_at = now() where id = p.id;
  end if;
end;
$$;

-- The author deletes their own post; a group admin removes anyone's (audited).
-- The text goes at once; open reports keep their own copy (D-079).
create or replace function public.delete_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.posts;
  c record;
  v_by_admin boolean;
begin
  p := private.visible_post(p_post, v_uid);
  select * into c from private.social_member(p.group_id, false);
  v_by_admin := p.author_id is distinct from v_uid;
  if v_by_admin and c.my_role not in ('owner', 'admin') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'post_write', 25, interval '1 hour');
  update public.posts
     set deleted_at = now(), body = null, pinned = false, removed_by_admin = v_by_admin
   where id = p.id;
  delete from public.reactions where target_type = 'post' and target_id = p.id;
  if v_by_admin then
    perform private.group_audit(v_uid, 'post.removed', p.group_id, p.author_id,
                                jsonb_build_object('post', p.id, 'kind', p.kind));
  end if;
end;
$$;

-- Owners and admins pin announcements, at most three at a time.
create or replace function public.pin_post(p_post uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.posts;
  c record;
begin
  p := private.visible_post(p_post, v_uid);
  select * into c from private.social_member(p.group_id, true);
  if c.my_role not in ('owner', 'admin') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  if p_pinned is null or p.kind <> 'announcement' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'post_write', 25, interval '1 hour');
  perform 1 from public.groups g where g.id = p.group_id for update;
  if p_pinned and not p.pinned
     and (select count(*) from public.posts x where x.group_id = p.group_id and x.pinned)
         >= util.config_int('wall_pinned_max') then
    raise exception 'pinned_full';
  end if;
  update public.posts set pinned = p_pinned where id = p.id;
  perform private.group_audit(v_uid, case when p_pinned then 'post.pinned' else 'post.unpinned' end,
                              p.group_id, null, jsonb_build_object('post', p.id));
end;
$$;

-- ---------------------------------------------------------------- comments

create or replace function public.create_comment(p_post uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.posts;
  v_body text;
  v_id uuid;
begin
  p := private.visible_post(p_post, v_uid);
  perform private.social_member(p.group_id, true);
  v_body := private.clean_social_text(p_body, 500);
  perform private.throttle(v_uid, 'comment_write', 75, interval '1 hour');
  insert into public.comments (post_id, group_id, author_id, body)
  values (p.id, p.group_id, v_uid, v_body)
  returning id into v_id;
  if p.author_id is not null and p.author_id <> v_uid then
    perform private.queue_encouragement(v_uid, p.group_id, 'comment:' || v_uid || ':' || p.id);
  end if;
  return v_id;
end;
$$;

create or replace function public.edit_comment(p_comment uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  c public.comments;
  v_body text;
begin
  c := private.visible_comment(p_comment, v_uid);
  perform private.social_member(c.group_id, true);
  if c.author_id is distinct from v_uid then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  v_body := private.clean_social_text(p_body, 500);
  perform private.throttle(v_uid, 'comment_write', 75, interval '1 hour');
  if v_body is distinct from c.body then
    update public.comments set body = v_body, edited_at = now() where id = c.id;
  end if;
end;
$$;

create or replace function public.delete_comment(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  c public.comments;
  m record;
  v_by_admin boolean;
begin
  c := private.visible_comment(p_comment, v_uid);
  select * into m from private.social_member(c.group_id, false);
  v_by_admin := c.author_id is distinct from v_uid;
  if v_by_admin and m.my_role not in ('owner', 'admin') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'comment_write', 75, interval '1 hour');
  update public.comments set deleted_at = now(), body = null, removed_by_admin = v_by_admin where id = c.id;
  delete from public.reactions where target_type = 'comment' and target_id = c.id;
  if v_by_admin then
    perform private.group_audit(v_uid, 'comment.removed', c.group_id, c.author_id,
                                jsonb_build_object('comment', c.id, 'post', c.post_id));
  end if;
end;
$$;

-- ---------------------------------------------------------------- reactions

-- Adds (p_on) or takes back one reaction on a post or comment. Reacting to
-- someone else's encourages them: +1 XP for the giver (once per target), and
-- "I prayed" counts towards Prayer Warrior.
create or replace function public.set_reaction(p_target_type text, p_target uuid, p_kind text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  v_group uuid;
  v_author uuid;
  v_rows integer;
  p public.posts;
  c public.comments;
begin
  if p_kind is null or p_kind not in ('pray', 'heart', 'fire', 'strong', 'dove') or p_on is null
     or p_target_type is null or p_target_type not in ('post', 'comment') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_target_type = 'post' then
    p := private.visible_post(p_target, v_uid);
    v_group := p.group_id;
    v_author := p.author_id;
  else
    c := private.visible_comment(p_target, v_uid);
    v_group := c.group_id;
    v_author := c.author_id;
  end if;
  perform private.social_member(v_group, true);
  perform private.throttle(v_uid, 'reaction', 250, interval '1 hour');

  if p_on then
    insert into public.reactions (group_id, user_id, target_type, target_id, kind)
    values (v_group, v_uid, p_target_type, p_target, p_kind)
    on conflict (user_id, target_type, target_id, kind) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 and v_author is not null and v_author <> v_uid then
      perform private.queue_encouragement(v_uid, v_group,
                                          'reaction:' || v_uid || ':' || p_target_type || ':' || p_target);
    end if;
  else
    delete from public.reactions
     where user_id = v_uid and target_type = p_target_type and target_id = p_target and kind = p_kind;
  end if;
end;
$$;

-- ---------------------------------------------------------------- block

-- Anyone you share a group with. A block ends nothing in the past but hides
-- everything both ways from now on (D-078). Unblocking works whether or not
-- you still share a group.
create or replace function public.block_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if p_user is null or p_user = v_uid then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not util.shares_group(v_uid, p_user) and not exists (
    select 1 from public.blocks where blocker_id = v_uid and blocked_id = p_user
  ) then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'block', 40, interval '1 day');
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user)
  on conflict do nothing;
end;
$$;

create or replace function public.unblock_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  perform private.throttle(v_uid, 'block', 40, interval '1 day');
  delete from public.blocks where blocker_id = v_uid and blocked_id = p_user;
end;
$$;

-- The people I've blocked, with the name they had: profile cards are closed
-- between us, so this is the only place it shows.
create or replace function public.my_blocked_people()
returns table (user_id uuid, display_name text, handle text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select k.blocked_id, p.display_name, p.handle, k.created_at
    from public.blocks k
    join public.profiles p on p.id = k.blocked_id and p.deleted_at is null
   where k.blocker_id = private.caller()
   order by k.created_at desc;
$$;

-- ---------------------------------------------------------------- reports

-- Report a post, a comment or a member to the group's admins (D-079). The
-- text is copied as it is now. One open report per person and target.
create or replace function public.report_content(
  p_group uuid, p_target_type text, p_target uuid, p_reason text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_subject uuid;
  v_snapshot text;
  v_note text;
  v_id uuid;
  p public.posts;
  cm public.comments;
begin
  select * into c from private.social_member(p_group, false);
  if p_reason is null or p_reason not in ('unkind', 'sexual', 'hateful', 'spam', 'unsafe', 'other')
     or p_target_type is null or p_target_type not in ('post', 'comment', 'member') or p_target is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_target_type = 'post' then
    p := private.visible_post(p_target, c.caller_id);
    if p.group_id <> p_group then
      raise exception 'post_not_found' using errcode = '42501';
    end if;
    v_subject := p.author_id;
    v_snapshot := p.body;
  elsif p_target_type = 'comment' then
    cm := private.visible_comment(p_target, c.caller_id);
    if cm.group_id <> p_group then
      raise exception 'comment_not_found' using errcode = '42501';
    end if;
    v_subject := cm.author_id;
    v_snapshot := cm.body;
  else
    if p_target = c.caller_id or not exists (
      select 1 from public.group_members m
       where m.group_id = p_group and m.user_id = p_target and m.status = 'active'
    ) then
      raise exception 'member_not_found' using errcode = '42501';
    end if;
    v_subject := p_target;
  end if;
  if v_subject = c.caller_id then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_note := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g')), '');
  if char_length(v_note) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select r.id into v_id from public.reports r
   where r.reporter_id = c.caller_id and r.target_type = p_target_type and r.target_id = p_target
     and r.status = 'open';
  if v_id is not null then
    return v_id;
  end if;
  perform private.throttle(c.caller_id, 'report', 25, interval '1 day');
  insert into public.reports (group_id, reporter_id, target_type, target_id, subject_id, reason, note, snapshot)
  values (p_group, c.caller_id, p_target_type, p_target, v_subject, p_reason, v_note, v_snapshot)
  returning id into v_id;
  return v_id;
end;
$$;

-- The group's open reports, for its admins, never showing who reported and
-- never reports about the admin reading them.
create or replace function public.group_reports(p_group uuid)
returns table (
  id uuid, target_type text, target_id uuid, post_id uuid, subject_id uuid, reason text, note text, snapshot text,
  created_at timestamptz, still_there boolean, reports_on_target bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.social_member(p_group, false);
  if c.my_role not in ('owner', 'admin') then
    raise exception 'group_forbidden' using errcode = '42501';
  end if;
  return query
  select r.id, r.target_type, r.target_id,
         case r.target_type
           when 'post' then r.target_id
           when 'comment' then (select x.post_id from public.comments x where x.id = r.target_id)
         end,
         r.subject_id, r.reason, r.note, r.snapshot, r.created_at,
         case r.target_type
           when 'post' then exists (select 1 from public.posts x where x.id = r.target_id and x.deleted_at is null)
           when 'comment' then exists (select 1 from public.comments x where x.id = r.target_id and x.deleted_at is null)
           else exists (select 1 from public.group_members m
                         where m.group_id = p_group and m.user_id = r.target_id and m.status = 'active')
         end,
         count(*) over (partition by r.target_type, r.target_id)
    from public.reports r
   where r.group_id = p_group and r.status = 'open'
     and r.subject_id is distinct from c.caller_id
   order by r.created_at;
end;
$$;

-- An admin closes a report: actioned (they removed it or spoke to the person)
-- or dismissed. The copied text is cleared either way. Audited.
create or replace function public.resolve_report(p_report uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  r public.reports;
  c record;
begin
  select * into r from public.reports where id = p_report;
  if r.id is null then
    raise exception 'report_not_found' using errcode = '42501';
  end if;
  begin
    select * into c from private.social_member(r.group_id, false);
  exception when insufficient_privilege then
    raise exception 'report_not_found' using errcode = '42501';
  end;
  if c.my_role not in ('owner', 'admin') or r.subject_id = v_uid then
    raise exception 'report_not_found' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('actioned', 'dismissed') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if r.status <> 'open' then
    return;
  end if;
  perform private.throttle(v_uid, 'group_manage', 150, interval '1 hour');
  update public.reports
     set status = p_outcome, resolved_at = now(), resolved_by = v_uid, snapshot = null
   where id = r.id;
  perform private.group_audit(v_uid, 'report.resolved', r.group_id, null,
                              jsonb_build_object('report', r.id, 'outcome', p_outcome));
end;
$$;

-- ---------------------------------------------------------------- reading the wall
-- The rows behind group_wall and wall_post, for one viewer.
-- out, and so are their reactions and comments in the counts.
create or replace function private.wall_rows(
  p_caller uuid, p_group uuid, p_kind text, p_before uuid, p_limit integer, p_post uuid
)
returns table (
  id uuid, kind text, author_id uuid, body text, badge text, pinned boolean,
  created_at timestamptz, edited_at timestamptz, comment_count bigint,
  reactions jsonb, my_reactions text[], is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blocked uuid[] := util.block_set(p_caller);
begin
  return query
  select p.id, p.kind, p.author_id, p.body, p.badge, p.pinned, p.created_at, p.edited_at,
         (select count(*) from public.comments x
            left join public.profiles xa on xa.id = x.author_id
           where x.post_id = p.id and x.deleted_at is null
             and (x.author_id is null or (xa.deletion_requested_at is null and xa.deleted_at is null
                                          and x.author_id <> all (v_blocked)))),
         coalesce((select jsonb_object_agg(rc.kind, rc.n) from (
           select r.kind, count(*) as n from public.reactions r
             join public.profiles ra on ra.id = r.user_id
            where r.target_type = 'post' and r.target_id = p.id
              and ra.deletion_requested_at is null and r.user_id <> all (v_blocked)
            group by r.kind) rc), '{}'::jsonb),
         coalesce((select array_agg(r.kind order by r.kind) from public.reactions r
                    where r.target_type = 'post' and r.target_id = p.id and r.user_id = p_caller), '{}'),
         p.author_id is not distinct from p_caller
    from public.posts p
    left join public.profiles a on a.id = p.author_id
   where p.group_id = p_group and p.deleted_at is null
     and (p.author_id is null or (a.deletion_requested_at is null and a.deleted_at is null
                                  and p.author_id <> all (v_blocked)))
     and case
           when p_post is not null then p.id = p_post
           when p_kind = 'pinned' then p.pinned
           else not p.pinned and (p_kind is null or p.kind = p_kind)
                and (p_before is null or p.id < p_before)
         end
   order by p.id desc
   limit case when p_kind = 'pinned' or p_post is not null then 50 else p_limit end;
end;
$$;

revoke all on function private.wall_rows(uuid, uuid, text, uuid, integer, uuid) from public;

-- One page of a group's wall, newest first, for a member. p_kind: null (all),
-- 'pinned' (the pinned announcements, not paged), or one kind. p_before is the
-- last post id of the previous page (ids are time-ordered UUIDv7; no OFFSET).
-- Posts by people blocked either way, or whose accounts are closing, are left
-- out, and so are their reactions and comments in the counts.
create or replace function public.group_wall(
  p_group uuid, p_kind text default null, p_before uuid default null, p_limit integer default 20
)
returns table (
  id uuid, kind text, author_id uuid, body text, badge text, pinned boolean,
  created_at timestamptz, edited_at timestamptz, comment_count bigint,
  reactions jsonb, my_reactions text[], is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.social_member(p_group, false);
  if (p_kind is not null and p_kind not in ('pinned', 'encouragement', 'prayer_request', 'testimony',
                                            'announcement', 'milestone'))
     or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query select * from private.wall_rows(c.caller_id, p_group, p_kind, p_before, p_limit, null);
end;
$$;

-- One post, by id, with the same columns plus its group (post_not_found otherwise).
create or replace function public.wall_post(p_post uuid)
returns table (
  id uuid, group_id uuid, kind text, author_id uuid, body text, badge text, pinned boolean,
  created_at timestamptz, edited_at timestamptz, comment_count bigint,
  reactions jsonb, my_reactions text[], is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.posts;
begin
  p := private.visible_post(p_post, v_uid);
  return query
  select w.id, p.group_id, w.kind, w.author_id, w.body, w.badge, w.pinned, w.created_at, w.edited_at,
         w.comment_count, w.reactions, w.my_reactions, w.is_mine
    from private.wall_rows(v_uid, p.group_id, null, null, 1, p.id) w;
end;
$$;

-- A post's comments, oldest first, with their reactions.
create or replace function public.post_comments(p_post uuid)
returns table (
  id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  reactions jsonb, my_reactions text[], is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  p public.posts;
  v_blocked uuid[];
begin
  p := private.visible_post(p_post, v_uid);
  v_blocked := util.block_set(v_uid);
  return query
  select x.id, x.author_id, x.body, x.created_at, x.edited_at,
         coalesce((select jsonb_object_agg(rc.kind, rc.n) from (
           select r.kind, count(*) as n from public.reactions r
             join public.profiles ra on ra.id = r.user_id
            where r.target_type = 'comment' and r.target_id = x.id
              and ra.deletion_requested_at is null and r.user_id <> all (v_blocked)
            group by r.kind) rc), '{}'::jsonb),
         coalesce((select array_agg(r.kind order by r.kind) from public.reactions r
                    where r.target_type = 'comment' and r.target_id = x.id and r.user_id = v_uid), '{}'),
         x.author_id is not distinct from v_uid
    from public.comments x
    left join public.profiles a on a.id = x.author_id
   where x.post_id = p.id and x.deleted_at is null
     and (x.author_id is null or (a.deletion_requested_at is null and a.deleted_at is null
                                  and x.author_id <> all (v_blocked)))
   order by x.id
   limit 500;
end;
$$;

-- ---------------------------------------------------------------- export

-- The person's own wall contributions for "Download my data" (D-032): their
-- posts and comments (text as it is now; deleted ones without text), their
-- reactions, the people they blocked (ids only) and the reports they made.
-- Never who reported them, and nothing anyone else wrote.
create or replace function public.my_social_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  return jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'kind', p.kind, 'text', p.body, 'badge', p.badge, 'pinned', p.pinned,
               'created_at', p.created_at, 'edited_at', p.edited_at, 'deleted_at', p.deleted_at)
             order by p.created_at)
        from public.posts p left join public.groups g on g.id = p.group_id
       where p.author_id = v_uid), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'post', c.post_id, 'text', c.body,
               'created_at', c.created_at, 'edited_at', c.edited_at, 'deleted_at', c.deleted_at)
             order by c.created_at)
        from public.comments c left join public.groups g on g.id = c.group_id
       where c.author_id = v_uid), '[]'::jsonb),
    'reactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'on', r.target_type, 'item', r.target_id, 'reaction', r.kind,
               'created_at', r.created_at)
             order by r.created_at)
        from public.reactions r left join public.groups g on g.id = r.group_id
       where r.user_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('person', k.blocked_id, 'created_at', k.created_at) order by k.created_at)
        from public.blocks k where k.blocker_id = v_uid), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', g.name, 'about', r.target_type, 'item', r.target_id, 'reason', r.reason, 'note', r.note,
               'status', r.status, 'created_at', r.created_at, 'resolved_at', r.resolved_at)
             order by r.created_at)
        from public.reports r left join public.groups g on g.id = r.group_id
       where r.reporter_id = v_uid), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_post(uuid, text, text)', 'public.edit_post(uuid, text)', 'public.delete_post(uuid)',
    'public.pin_post(uuid, boolean)', 'public.create_comment(uuid, text)', 'public.edit_comment(uuid, text)',
    'public.delete_comment(uuid)', 'public.set_reaction(text, uuid, text, boolean)',
    'public.block_member(uuid)', 'public.unblock_member(uuid)', 'public.my_blocked_people()',
    'public.report_content(uuid, text, uuid, text, text)', 'public.group_reports(uuid)',
    'public.resolve_report(uuid, text)', 'public.group_wall(uuid, text, uuid, integer)',
    'public.wall_post(uuid)', 'public.post_comments(uuid)', 'public.my_social_export()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- what groups see, with blocks

-- As in 5a, plus: someone blocked either way drops out of the Today panel.
create or replace view public.group_checkins_today
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
  case when v.rank >= 3 then c.triggers end as triggers,
  case when v.rank >= 1 then util.member_level(m.user_id) end as level
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
  and not util.blocked_between(auth.uid(), m.user_id)
  and m.group_id in (
    select me.group_id from public.group_members me
     where me.user_id = auth.uid() and me.status = 'active'
  );

-- ---------------------------------------------------------------- boards, with blocks

-- As in 5c, plus: someone blocked either way keeps their place without a name.
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
  v_week := util.week_start(util.local_today(g.group_timezone, v_now));

  return query
  with eligible as (
    select e.*, ((m.leaderboard_hidden and g.leaderboard_hiding_allowed)
                    or util.blocked_between(v_uid, e.user_id)) as hidden,
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
    select el.user_id, el.hidden,
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
         case when r.hidden and r.user_id <> v_uid then null else r.user_id end,
         coalesce(r.v, 0),
         r.user_id = v_uid,
         r.hidden
    from ranked r
   where (r.rk > p_after and r.rk <= p_after + p_limit) or r.user_id = v_uid
   order by r.rk;
end;
$$;

-- ---------------------------------------------------------------- the queue, extended

-- A 'social' job awards First Testimony (and re-checks the other social badges).
create or replace function private.enqueue(p_type text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_type not in ('user_settle', 'group_stats', 'challenge_finished', 'encouragement', 'devotional',
                    'leaderboard', 'social') then
    raise exception 'job_unknown_type';
  end if;
  perform pgmq.send('jobs', jsonb_build_object('type', p_type) || coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- As in 5c, plus social badges after encouragement, and the 'social' job.
create or replace function private.run_job(p_msg jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p_msg ->> 'type';
  v_user uuid := (p_msg ->> 'user')::uuid;
  v_group uuid := (p_msg ->> 'group')::uuid;
  v_member uuid;
begin
  -- One person (or group) at a time, whatever else is running.
  if v_user is not null then
    perform pg_advisory_xact_lock(hashtextextended('xp:' || v_user, 0));
  end if;

  case v_type
    when 'user_settle' then
      if not exists (select 1 from public.profiles where id = v_user) then
        return;
      end if;
      perform private.settle_checkin_xp(v_user, (p_msg ->> 'from')::date);
      perform private.award_streak_badges(v_user);
      perform private.refresh_user_xp(v_user);
      perform private.refresh_group_stats(null, v_user);
      perform private.refresh_leaderboard(null, v_user);
    when 'group_stats' then
      if v_group is null then
        raise exception 'job_bad_payload';
      end if;
      perform private.refresh_group_stats(v_group, v_user);
      perform private.refresh_leaderboard(v_group, v_user);
    when 'leaderboard' then
      if v_group is null and v_user is null then
        raise exception 'job_bad_payload';
      end if;
      perform private.refresh_leaderboard(v_group, v_user);
    when 'encouragement' then
      perform private.award_encouragement(v_user, p_msg ->> 'key', v_group,
                                          coalesce((p_msg ->> 'at')::timestamptz, now()));
      perform private.award_social_badges(v_user);
      perform private.refresh_user_xp(v_user);
      if v_group is not null and exists (select 1 from public.groups where id = v_group) then
        perform private.refresh_group_stats(v_group, v_user);
        perform private.refresh_leaderboard(v_group, v_user);
      end if;
    when 'social' then
      if not exists (select 1 from public.profiles where id = v_user) then
        return;
      end if;
      perform private.award_social_badges(v_user);
    when 'devotional' then
      perform private.award_devotional(v_user, p_msg ->> 'key', coalesce((p_msg ->> 'at')::timestamptz, now()));
      perform private.refresh_user_xp(v_user);
      perform private.refresh_group_stats(null, v_user);
      perform private.refresh_leaderboard(null, v_user);
    when 'challenge_finished' then
      if v_group is null then
        raise exception 'job_bad_payload';
      end if;
      for v_member in select * from private.award_challenge_finished(v_group) loop
        perform private.refresh_user_xp(v_member);
      end loop;
      perform private.refresh_group_stats(v_group, null);
      perform private.refresh_leaderboard(v_group, null);
    else
      raise exception 'job_unknown_type';
  end case;
end;
$$;

-- ---------------------------------------------------------------- erasing an account

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

  -- Phase 6a (D-077): posts and comments stay, as "A former member";
  -- reactions, blocks and the reports they made go. Reports about them keep
  -- the report but lose the link to the person.
  update public.posts set author_id = null where author_id = p_user_id;
  update public.comments set author_id = null where author_id = p_user_id;
  delete from public.reactions where user_id = p_user_id;
  delete from public.blocks where p_user_id in (blocker_id, blocked_id);
  delete from public.reports where reporter_id = p_user_id;
  update public.reports set subject_id = null where subject_id = p_user_id;
  -- Phase 6b: nudges and partnerships.
end;
$$;
