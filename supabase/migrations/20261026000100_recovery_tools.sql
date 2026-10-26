-- recovery: the SOS sheet's tally and partner numbers, and the private journal
-- (CLAUDE.md §7.9). Phase 8a; see D-106 to D-109.
--
-- Waves ridden out (the "urges resisted" tally): one number per person and
-- nothing else. No dates or times are kept, so the tally can never show a gap
-- or a failure, and it says nothing about when someone was struggling.
--
-- A number partners can call: optional, encrypted by the app (AES-256-GCM,
-- APP_ENCRYPTION_KEY, D-025) before it reaches the database, and handed out
-- (still encrypted) only to the person's active partners.
--
-- Journal entries: encrypted the same way; readable only by their author
-- (§6). Admins and the database console see only ciphertext, and there is no
-- admin path to them at all. Not audited (D-099).
--
-- Retention: all three are the person's own and are kept until they remove
-- them or the account is deleted (they go with the profile, on delete
-- cascade). They are in the data export.

-- ---------------------------------------------------------------- waves ridden out

create table public.recovery_tallies (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  waves integer not null default 0 check (waves >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.recovery_tallies is
  'Waves ridden out (§7.9, D-106): one number per person, no dates. Read by its owner; written only by count_wave().';

alter table public.recovery_tallies enable row level security;
revoke all on table public.recovery_tallies from anon, authenticated;
grant select on table public.recovery_tallies to authenticated;

create policy "recovery_tallies: owner reads" on public.recovery_tallies
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "recovery_tallies: live, verified session" on public.recovery_tallies
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- One more wave ridden out. It only ever counts up (grace: nothing is ever
-- recorded as a failure). Returns the new total.
create or replace function public.count_wave()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  v_total integer;
begin
  if not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'count_wave', 30, interval '1 hour');
  insert into public.recovery_tallies as t (user_id, waves, updated_at)
  values (v_uid, 1, now())
  on conflict (user_id) do update set waves = t.waves + 1, updated_at = now()
  returning waves into v_total;
  return v_total;
end;
$$;

revoke all on function public.count_wave() from public, anon;
grant execute on function public.count_wave() to authenticated;

-- ---------------------------------------------------------------- a number partners can call

create table public.partner_contacts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- "v1:<iv>:<tag>:<ciphertext>", bound to user_id (src/lib/security/encryption.ts).
  phone_encrypted text not null check (phone_encrypted ~ '^v1:' and length(phone_encrypted) <= 400),
  updated_at timestamptz not null default now()
);

comment on table public.partner_contacts is
  'A phone or WhatsApp number for my active partners (§7.9, D-107). Encrypted by the app; the owner reads it, partners get it only through partner_contact_for().';

alter table public.partner_contacts enable row level security;
revoke all on table public.partner_contacts from anon, authenticated;
grant select on table public.partner_contacts to authenticated;

create policy "partner_contacts: owner reads" on public.partner_contacts
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "partner_contacts: live, verified session" on public.partner_contacts
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- Save (or, with null, remove) my number. The app encrypts it first.
create or replace function public.set_partner_contact(p_phone_encrypted text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'partner_contact', 20, interval '1 hour');
  if p_phone_encrypted is null then
    delete from public.partner_contacts where user_id = v_uid;
    return;
  end if;
  if p_phone_encrypted !~ '^v1:' or length(p_phone_encrypted) > 400 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.partner_contacts as c (user_id, phone_encrypted, updated_at)
  values (v_uid, p_phone_encrypted, now())
  on conflict (user_id) do update set phone_encrypted = excluded.phone_encrypted, updated_at = now();
end;
$$;

revoke all on function public.set_partner_contact(text) from public, anon;
grant execute on function public.set_partner_contact(text) to authenticated;

-- My active partners' numbers (still encrypted; the app decrypts them with
-- each partner's id). Nothing for an ended or pending partnership, across a
-- block, or for a closing account.
create or replace function public.partner_contacts_for_me()
returns table (partner_id uuid, phone_encrypted text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  return query
  select distinct c.user_id, c.phone_encrypted
    from public.partnerships p
    join public.partner_contacts c
      on c.user_id = case when p.user_a = v_uid then p.user_b else p.user_a end
   where p.status = 'active'
     and v_uid in (p.user_a, p.user_b)
     and util.account_open(c.user_id)
     and not util.blocked_between(v_uid, c.user_id)
     and exists (select 1 from public.group_members m
                  where m.group_id = p.group_id and m.user_id = v_uid and m.status = 'active');
end;
$$;

revoke all on function public.partner_contacts_for_me() from public, anon;
grant execute on function public.partner_contacts_for_me() to authenticated;

-- ---------------------------------------------------------------- the journal

create table public.journal_entries (
  id uuid primary key default util.uuid_v7(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The guided prompt it answers, if any (a key into the app's messages).
  prompt_key text check (prompt_key ~ '^p[0-9]{2}$'),
  -- "v1:<iv>:<tag>:<ciphertext>", bound to the entry's id and author.
  body_encrypted text not null check (body_encrypted ~ '^v1:' and length(body_encrypted) <= 28000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journal_entries_user_idx on public.journal_entries (user_id, created_at desc, id desc);

comment on table public.journal_entries is
  'Private journal (§7.9, D-108). Encrypted by the app; readable only by the author. Never audited (D-099); no admin path.';

alter table public.journal_entries enable row level security;
revoke all on table public.journal_entries from anon, authenticated;
grant select on table public.journal_entries to authenticated;

create policy "journal_entries: author reads" on public.journal_entries
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "journal_entries: live, verified session" on public.journal_entries
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));

-- Write a new entry (p_id null) or replace my own. The app encrypts the text
-- first, binding it to the id it chose, so the id comes from the app.
create or replace function public.save_journal_entry(p_id uuid, p_prompt_key text, p_body_encrypted text, p_new boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  if p_id is null or p_body_encrypted is null or p_body_encrypted !~ '^v1:' or length(p_body_encrypted) > 28000
     or (p_prompt_key is not null and p_prompt_key !~ '^p[0-9]{2}$') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'journal_write', 60, interval '1 hour');
  if p_new then
    insert into public.journal_entries (id, user_id, prompt_key, body_encrypted)
    values (p_id, v_uid, p_prompt_key, p_body_encrypted);
  else
    update public.journal_entries
       set body_encrypted = p_body_encrypted, updated_at = now()
     where id = p_id and user_id = v_uid;
    if not found then
      raise exception 'entry_not_found' using errcode = '42501';
    end if;
  end if;
  return p_id;
end;
$$;

revoke all on function public.save_journal_entry(uuid, text, text, boolean) from public, anon;
grant execute on function public.save_journal_entry(uuid, text, text, boolean) to authenticated;

create or replace function public.delete_journal_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  perform private.throttle(v_uid, 'journal_write', 60, interval '1 hour');
  delete from public.journal_entries where id = p_id and user_id = v_uid;
  if not found then
    raise exception 'entry_not_found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.delete_journal_entry(uuid) from public, anon;
grant execute on function public.delete_journal_entry(uuid) to authenticated;
