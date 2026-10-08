-- Privacy and discretion review 1 (D-056, D-057): data we don't need is not
-- kept.
--   - Google's name and photo never stay in Supabase Auth (or the tokens).
--   - Supabase Auth's IP addresses and browser strings are cleared hourly.
--   - Rate-limit windows that have passed are removed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- A Google sign-up, as Supabase Auth writes it.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-7000-8000-000000004001', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'miriam@example.test', '{"provider":"google","providers":["google"]}',
        '{"iss":"https://accounts.google.com","sub":"1234","name":"Miriam Real-Name","full_name":"Miriam Real-Name",
          "email":"miriam@example.test","picture":"https://lh3.googleusercontent.com/a/photo","avatar_url":"https://lh3.googleusercontent.com/a/photo",
          "given_name":"Miriam","provider_id":"1234","email_verified":true,"phone_verified":false}',
        now(), now());
insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
values ('00000000-0000-7000-8000-000000004101', '1234', '00000000-0000-7000-8000-000000004001',
        '{"iss":"https://accounts.google.com","sub":"1234","name":"Miriam Real-Name","full_name":"Miriam Real-Name",
          "email":"miriam@example.test","picture":"https://lh3.googleusercontent.com/a/photo",
          "avatar_url":"https://lh3.googleusercontent.com/a/photo","provider_id":"1234","email_verified":true}',
        'google', now(), now());

select is((select raw_user_meta_data from auth.users where id = '00000000-0000-7000-8000-000000004001'),
  '{"iss":"https://accounts.google.com","sub":"1234","email":"miriam@example.test","provider_id":"1234",
    "email_verified":true,"phone_verified":false}'::jsonb,
  'A Google sign-up keeps no name or photo in the user''s metadata (which goes into every token)');
select is((select identity_data from auth.identities where id = '00000000-0000-7000-8000-000000004101'),
  '{"iss":"https://accounts.google.com","sub":"1234","email":"miriam@example.test","provider_id":"1234",
    "email_verified":true}'::jsonb,
  '... nor in the Google identity');
select is((select email from auth.identities where id = '00000000-0000-7000-8000-000000004101'),
  'miriam@example.test', '... which still has the email Supabase Auth matches on');

-- Every later sign-in writes Google's data again.
update auth.users
   set raw_user_meta_data = raw_user_meta_data || '{"name":"Miriam Real-Name","picture":"https://x.test/p"}'
 where id = '00000000-0000-7000-8000-000000004001';
update auth.identities
   set identity_data = identity_data || '{"full_name":"Miriam Real-Name","avatar_url":"https://x.test/p"}'
 where id = '00000000-0000-7000-8000-000000004101';
select ok((select not (raw_user_meta_data ?| array['name', 'picture']) from auth.users
            where id = '00000000-0000-7000-8000-000000004001'),
  'A later sign-in''s name and photo are dropped again');
select ok((select not (identity_data ?| array['full_name', 'avatar_url']) from auth.identities
            where id = '00000000-0000-7000-8000-000000004101'),
  '... in the identity too');

-- Email sign-ups still work: the ticket is read before it is dropped.
select public.create_signup_ticket(encode(extensions.digest('token-privacy-0000000000000000000000000001', 'sha256'), 'hex'), 'test-v1', 'UTC', 30);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values ('00000000-0000-7000-8000-000000004002', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'tabitha@example.test', now(), '{"provider":"email","providers":["email"]}',
        '{"signup_ticket":"token-privacy-0000000000000000000000000001","sub":"00000000-0000-7000-8000-000000004002","email":"tabitha@example.test","email_verified":false,"phone_verified":false}',
        now(), now());
select ok(exists (select 1 from public.profiles where id = '00000000-0000-7000-8000-000000004002'),
  'An email sign-up with a ticket still creates the account');
select is((select raw_user_meta_data from auth.users where id = '00000000-0000-7000-8000-000000004002'),
  '{"sub":"00000000-0000-7000-8000-000000004002","email":"tabitha@example.test","email_verified":false,"phone_verified":false}'::jsonb,
  '... and keeps only what Supabase Auth needs');
select throws_ok(
  $$ insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-7000-8000-000000004003', '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', 'nobody@example.test', '{"provider":"email"}', '{"name":"No Ticket"}', now(), now()) $$,
  '28000', 'signup_ticket_required', 'An email sign-up without a ticket is still refused');

-- Supabase Auth's own records.
insert into auth.sessions (id, user_id, created_at, updated_at, ip, user_agent)
values ('00000000-0000-7000-8000-00000000c401', '00000000-0000-7000-8000-000000004002', now(), now(),
        '203.0.113.7', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36');
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-7000-8000-00000000a401',
        '{"action":"login","actor_username":"tabitha@example.test"}', now(), '203.0.113.7'),
       ('00000000-0000-0000-0000-000000000000', '00000000-0000-7000-8000-00000000a402',
        '{"action":"login","actor_username":"tabitha@example.test"}', now() - interval '2 days', '203.0.113.7');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-7000-8000-00000000f401', '00000000-0000-7000-8000-000000004002', 'app', 'totp', 'verified',
        now(), now());
insert into auth.mfa_challenges (id, factor_id, created_at, ip_address)
values ('00000000-0000-7000-8000-00000000e401', '00000000-0000-7000-8000-00000000f401', now() - interval '2 hours',
        '203.0.113.7'),
       ('00000000-0000-7000-8000-00000000e402', '00000000-0000-7000-8000-00000000f401', now(), '203.0.113.7');
insert into auth.flow_state (id, user_id, auth_code, code_challenge_method, code_challenge, provider_type,
                             provider_access_token, authentication_method, created_at, updated_at)
values ('00000000-0000-7000-8000-00000000b401', '00000000-0000-7000-8000-000000004002', 'code', 's256', 'challenge',
        'google', 'ya29.secret', 'oauth', now() - interval '2 hours', now() - interval '2 hours');

-- Rate-limit windows: one long over, one still running.
insert into private.rate_limit_counters (user_id, bucket, window_started_at, hits)
values ('00000000-0000-7000-8000-000000004002', 'checkin_save', now() - interval '3 days', 1),
       ('00000000-0000-7000-8000-000000004002', 'group_create', now() - interval '2 hours', 1);

select private.hourly_auth_maintenance();

select is((select row(ip, user_agent)::text from auth.sessions where id = '00000000-0000-7000-8000-00000000c401'),
  '(,)', 'The hourly clean-up clears the session''s IP address and browser string');
select ok(exists (select 1 from auth.sessions where id = '00000000-0000-7000-8000-00000000c401'),
  '... without signing anyone out');
select is((select count(*) from auth.audit_log_entries where ip_address <> ''), 0::bigint,
  'Supabase Auth''s audit trail keeps no IP addresses');
select is((select count(*) from auth.audit_log_entries where id = '00000000-0000-7000-8000-00000000a402'), 0::bigint,
  '... and only the last day of it');
select is((select array_agg(id::text) from auth.mfa_challenges), array['00000000-0000-7000-8000-00000000e402'],
  'Two-step challenges older than an hour are removed');
select is((select count(*) from auth.flow_state), 0::bigint,
  'Finished sign-in flows (which can hold Google''s tokens) are removed');
select is((select array_agg(bucket) from private.rate_limit_counters
            where user_id = '00000000-0000-7000-8000-000000004002'), array['group_create'],
  'Rate-limit windows that have passed are removed; running ones stay');
select ok((select count(*) from public.profiles where id = '00000000-0000-7000-8000-000000004002') = 1,
  'Real accounts are untouched');

select * from finish();
rollback;
