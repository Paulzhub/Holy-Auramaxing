-- notifications: sending push and email (CLAUDE.md §7.8). Phase 7c; see D-092.
--
-- The sender is the app's own route, /api/notify/deliver (Node: Web Push
-- needs the VAPID key and payload encryption; email needs the templates).
-- The database calls it with pg_net (an HTTP POST, Bearer CRON_SECRET) every
-- 10 seconds, but only when a delivery is waiting; the route claims a batch
-- (notify_claim), sends, and records the result (notify_finish). A push
-- subscription the push service answers 404 or 410 to is deleted at once.
-- The route's address and the secret live in Supabase Vault, set with
-- notify_configure() (the local launcher does it on every start).

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- push subscriptions

-- Save this browser's push subscription for me. An endpoint belongs to one
-- browser, so if someone else signed in there before, it moves to me. At
-- most 10 devices: the oldest goes.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
begin
  if p_endpoint is null or char_length(p_endpoint) > 1000 or p_endpoint not like 'https://%'
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{20,200}={0,2}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{8,100}={0,2}$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not util.account_open(v_uid) then
    raise exception 'account_closing' using errcode = '42501';
  end if;
  perform private.throttle(v_uid, 'push_subscription', 30, interval '1 hour');
  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, nullif(left(coalesce(p_label, ''), 60), ''))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, created_at = case when s.user_id = excluded.user_id then s.created_at else now() end;
  delete from public.push_subscriptions
   where id in (select ps.id from public.push_subscriptions ps where ps.user_id = v_uid
                 order by ps.created_at desc offset 10);
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Stop push on this browser (by endpoint) or on one of my devices (by id).
create or replace function public.remove_push_subscription(p_endpoint text default null, p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller();
  v_count integer;
begin
  if (p_endpoint is null) = (p_id is null) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.throttle(v_uid, 'push_subscription', 30, interval '1 hour');
  delete from public.push_subscriptions
   where user_id = v_uid and (endpoint = p_endpoint or id = p_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.remove_push_subscription(text, uuid) from public, anon;
grant execute on function public.remove_push_subscription(text, uuid) to authenticated;

-- Signing out everywhere, or closing the account, stops push on every device.
create or replace function private.push_forget_on_closing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deletion_requested_at is not null and old.deletion_requested_at is null then
    delete from public.push_subscriptions where user_id = new.id;
  end if;
  return null;
end;
$$;

create trigger profiles_closing_push after update of deletion_requested_at on public.profiles
  for each row execute function private.push_forget_on_closing();

revoke all on function private.push_forget_on_closing() from public;

-- ---------------------------------------------------------------- the sender's side (secret key only)

-- Claim up to p_limit ready deliveries (or ones claimed over two minutes ago
-- and never finished). Returns what the sender needs and nothing more: the
-- type and codes, whether to be discreet, the other person's display name
-- only if the recipient may see it (the same rule as profile cards), the
-- address for email, the devices for push, and the unread count for the
-- app-icon badge.
create or replace function public.notify_claim(p_limit integer default 100)
returns table (
  delivery_id uuid, channel text, user_id uuid, type text, group_id uuid, data jsonb,
  actor_name text, discreet boolean, sound boolean, vibrate boolean, bundle_count integer,
  email text, devices jsonb, unread integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  with picked as (
    select d.id from private.notification_deliveries d
     where (d.status = 'ready')
        or (d.status = 'sending' and d.claimed_at < now() - interval '2 minutes')
     order by d.created_at
     limit p_limit
     for update skip locked
  ),
  claimed as (
    update private.notification_deliveries d
       set status = 'sending', claimed_at = now(), attempts = d.attempts + 1
      from picked
     where d.id = picked.id
    returning d.*
  )
  select c.id, c.channel, c.user_id, n.type, n.group_id, coalesce(n.data, '{}'::jsonb),
         case when n.actor_id is not null and not util.blocked_between(c.user_id, n.actor_id)
                   and exists (select 1 from public.privacy_settings ps
                                where ps.user_id = n.actor_id
                                  and util.can_see(c.user_id, n.actor_id, ps.profile_visibility))
              then (select coalesce(nullif(p.display_name, ''), p.handle) from public.profiles p
                     where p.id = n.actor_id and p.deleted_at is null and p.deletion_requested_at is null) end,
         coalesce(s.discreet_mode, true), coalesce(s.sound, true), coalesce(s.vibrate, true), c.bundle_count,
         case when c.channel = 'email' then (select u.email::text from auth.users u where u.id = c.user_id) end,
         case when c.channel = 'push' then coalesce((
           select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
             from public.push_subscriptions ps where ps.user_id = c.user_id), '[]'::jsonb) end,
         (select count(*)::integer from public.notifications x where x.user_id = c.user_id and x.read_at is null)
    from claimed c
    left join public.notifications n on n.id = c.notification_id
    left join public.notification_settings s on s.user_id = c.user_id;
end;
$$;

revoke all on function public.notify_claim(integer) from public, anon, authenticated;
grant execute on function public.notify_claim(integer) to service_role;

-- Record what happened: [{id, status: sent | retry | failed, reason?, gone?: [endpoints], used?: [endpoints]}].
-- A retry comes back as ready until the fifth try, then it's failed. Gone
-- endpoints (404/410) are deleted at once.
create or replace function public.notify_finish(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_count integer := 0;
  v_status text;
begin
  if p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_results) loop
    v_status := r ->> 'status';
    if v_status not in ('sent', 'retry', 'failed') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    update private.notification_deliveries d
       set status = case
             when v_status = 'sent' then 'sent'
             when v_status = 'failed' or d.attempts >= 5 then 'failed'
             else 'ready' end,
           reason = case when v_status = 'sent' then null
                         else left(regexp_replace(coalesce(r ->> 'reason', 'error'), '[^a-z_0-9]', '_', 'g'), 40) end,
           sent_at = case when v_status = 'sent' then now() end,
           claimed_at = null
     where d.id = (r ->> 'id')::uuid and d.status = 'sending';
    if found then
      v_count := v_count + 1;
    end if;
    if jsonb_typeof(r -> 'gone') = 'array' then
      delete from public.push_subscriptions where endpoint in (select jsonb_array_elements_text(r -> 'gone'));
    end if;
    if jsonb_typeof(r -> 'used') = 'array' then
      update public.push_subscriptions set last_used_at = now()
       where endpoint in (select jsonb_array_elements_text(r -> 'used'));
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_finish(jsonb) from public, anon, authenticated;
grant execute on function public.notify_finish(jsonb) to service_role;

-- One-click unsubscribe from an email (RFC 8058): the route checks the
-- signed link, then turns that type's email off (or the digest's, by
-- turning the digest off). Security alerts can't be turned off.
create or replace function public.notify_unsubscribe(p_user uuid, p_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.notification_types;
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    return false;
  end if;
  if p_type = 'digest' then
    update public.notification_settings set digest = 'off' where user_id = p_user;
    update private.notification_deliveries
       set status = 'held', reason = 'digest_off', release_at = now()
     where user_id = p_user and status = 'digest';
    return true;
  end if;
  select * into t from public.notification_types where type = p_type;
  if t.type is null or t.locked then
    return false;
  end if;
  if t.email_default then
    insert into public.notification_preferences (user_id, type, channel, enabled)
    values (p_user, p_type, 'email', false)
    on conflict (user_id, type, channel) do update set enabled = false, updated_at = now();
  else
    delete from public.notification_preferences where user_id = p_user and type = p_type and channel = 'email';
  end if;
  return true;
end;
$$;

revoke all on function public.notify_unsubscribe(uuid, text) from public, anon, authenticated;
grant execute on function public.notify_unsubscribe(uuid, text) to service_role;

-- ---------------------------------------------------------------- calling the sender

-- Where the sender is, and the secret it expects. In Vault, never in a table.
create or replace function public.notify_configure(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url is null or p_url !~ '^https?://[^\s]+/api/notify/deliver$' or p_secret is null
     or char_length(p_secret) < 32 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = 'notify_deliver_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'notify_deliver_url', 'Where pg_net calls the notification sender (D-092).');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
  select id into v_id from vault.secrets where name = 'notify_deliver_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'notify_deliver_secret', 'Bearer token for the notification sender (CRON_SECRET).');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

revoke all on function public.notify_configure(text, text) from public, anon, authenticated;
grant execute on function public.notify_configure(text, text) to service_role;

-- pg_cron, every 10 seconds: when something is ready to go, ask the sender
-- to come and get it. The request carries no data, only the secret.
create or replace function private.kick_sender()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from private.notification_deliveries d
     where d.status = 'ready' or (d.status = 'sending' and d.claimed_at < now() - interval '2 minutes')
  ) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_deliver_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 9000
  );
end;
$$;

revoke all on function private.kick_sender() from public;

select cron.schedule('notify-sender', '10 seconds', $$select private.kick_sender()$$);

-- pg_net keeps each response for 6 hours by default; they hold nothing
-- personal (the route answers counts only), but there's no need to keep them.
create or replace function private.forget_sender_responses()
returns void language sql security definer set search_path = '' as $$
  delete from net._http_response where created < now() - interval '1 hour';
$$;

revoke all on function private.forget_sender_responses() from public;
select cron.schedule('notify-sender-responses', '17 * * * *', $$select private.forget_sender_responses()$$);

-- The worker keeps reading while time remains, so follow-on fan-out jobs
-- (a big group, a page at a time) go in the same run rather than 5 seconds
-- apart, but each run stops after a short budget (notify_run_ms) and smaller
-- pages (250), so a 5,000-member fan-out spreads over a few runs and page
-- requests are never starved (D-092, measured with npm run bench:notify).
update private.app_config set value = 250 where key = 'notify_fanout_page';
insert into private.app_config (key, value, description) values
  ('notify_run_ms', 750, 'How long one notify worker run may work before leaving the rest for the next (D-092).');

create or replace function private.run_notify(p_batch integer default 1000, p_wait boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_done integer := 0;
  v_failed integer := 0;
  v_state text;
  v_text text;
  v_started timestamptz := clock_timestamp();
  -- Tests (p_wait) run everything queued; the scheduled worker keeps to its budget.
  v_budget interval := case when p_wait then interval '1 minute'
                            else make_interval(secs => util.config_int('notify_run_ms') / 1000.0) end;
begin
  if p_wait then
    perform pg_advisory_xact_lock(hashtextextended('private.run_notify', 0));
  elsif not pg_try_advisory_xact_lock(hashtextextended('private.run_notify', 0)) then
    return 0;
  end if;

  -- One job at a time, so a run that stops at its budget leaves nothing
  -- invisible: the next run takes the rest at once. p_batch caps a run.
  while v_done + v_failed < p_batch and clock_timestamp() - v_started < v_budget loop
    select * into m from pgmq.read('notify', 30, 1);
    exit when m.msg_id is null;
    begin
      perform private.run_notify_job(m.message);
      perform pgmq.delete('notify', m.msg_id);
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
      get stacked diagnostics v_state = returned_sqlstate, v_text = message_text;
      if m.read_ct >= 5 then
        perform pgmq.send('notify_dead', m.message || jsonb_build_object(
          'failed_at', now(), 'tries', m.read_ct, 'sqlstate', v_state, 'error', left(v_text, 200)));
        perform pgmq.delete('notify', m.msg_id);
      end if;
    end;
  end loop;

  perform private.release_held(now());
  return v_done;
end;
$$;

revoke all on function private.run_notify(integer, boolean) from public;
