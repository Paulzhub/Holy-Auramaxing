# Threat model (STRIDE)

Living document, updated every phase (CLAUDE.md §10). **Last updated:** Phase 2e (data export, account deletion), 2026-10-06.

## Scope

**Phase 1:** public landing page, app shell, `/dev/components`, `/api/health`, theme cookie.

**Phase 2a adds:** accounts (Supabase Auth: email + password, magic link, Google), the age gate and consent records, `profiles`, `privacy_settings`, `consents`, `audit_log`, sign-up tickets, session cookies, email links, rate limits, Turnstile (production), and draft policy pages.

## Assets (now and soon)

| Asset                             | Sensitivity                                   | Arrives  |
| --------------------------------- | --------------------------------------------- | -------- |
| Check-ins, urges, triggers, notes | Special-category (sexual behaviour, religion) | Phase 4  |
| Journal entries                   | Special-category, author-only                 | Phase 8  |
| Group membership                  | Reveals faith and the struggle                | Phase 3  |
| Accounts, sessions, email         | Personal data                                 | Phase 2a |
| Consent records, 18+ confirmation | Legal evidence; must be accurate              | Phase 2a |
| Profile fields (bio, testimony)   | Personal; testimony may be sensitive          | Phase 2a |
| Theme preference cookie           | Not sensitive                                 | Phase 1  |

## Trust boundaries

Browser ⇄ Next.js (proxy, server components, server actions) ⇄ Supabase (Postgres with RLS, Auth, Storage). The publishable key is public. The secret key is used only in server code (`src/lib/supabase/admin.ts`) for issuing sign-up tickets, finishing Google sign-ups, deleting orphaned auth users and writing the audit log.

## STRIDE

| Threat                     | Example                                     | Mitigation in place                                                                                                                                                                                                                                                                                                                                                               | Planned                                                       |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **S**poofing               | Account takeover                            | Supabase Auth; NIST passwords + breached-password check (D-017); per-IP and per-email rate limits with a 15-minute lock after 5 failures (D-019); Turnstile in production (D-018); refresh-token rotation with reuse detection; 10-minute access tokens; password reset signs out every other session; optional two-step sign-in, passkeys, sessions page, new-device alerts (2d) | Required two-factor for platform admins (11)                  |
| **T**ampering              | Forged theme or form posts                  | Theme values allow-listed (zod on the server, type guard on the client); Server Actions check the Origin header (CSRF)                                                                                                                                                                                                                                                            | Zod on every server boundary                                  |
| **T**ampering              | Supply-chain compromise                     | Lockfile, `npm ci`, Dependabot, CodeQL, `npm audit` (production dependencies), GitHub Actions pinned to commit SHAs                                                                                                                                                                                                                                                               | OSV and ZAP baseline in Phase 11                              |
| **R**epudiation            | User or admin denies an action              | `audit_log`: sign-ups, sign-ins, failures, sign-outs, password changes; insert-only, unreadable through the API, kept 1 year, no IPs (D-016)                                                                                                                                                                                                                                      | Role changes (3), admin actions (11)                          |
| **I**nformation disclosure | XSS stealing session data                   | Nonce CSP with `strict-dynamic`; no `unsafe-inline` or `unsafe-eval` for scripts; style attributes limited to two reviewed hashes; React escapes output by default                                                                                                                                                                                                                | DOMPurify only if rich text is ever added                     |
| **I**nformation disclosure | Shoulder-surfing via the tab title          | Tab titles use the neutral "Aura" (tested)                                                                                                                                                                                                                                                                                                                                        | Discreet manifest, notifications and emails (Phases 7 and 10) |
| **I**nformation disclosure | Indexing of private pages                   | `noindex` on every app route (tested); the health endpoint reveals no configuration (tested)                                                                                                                                                                                                                                                                                      | Sitemap and robots in Phase 9                                 |
| **I**nformation disclosure | Cross-group data leak                       | —                                                                                                                                                                                                                                                                                                                                                                                 | Phase 3: RLS and an isolation test suite                      |
| **I**nformation disclosure | Leaking secrets                             | `.env*` ignored (except `.env.example`), gitleaks in CI, secret key never imported client-side                                                                                                                                                                                                                                                                                    | —                                                             |
| **D**enial of service      | Floods on public endpoints                  | —                                                                                                                                                                                                                                                                                                                                                                                 | Upstash rate limits, Cloudflare WAF                           |
| **E**levation of privilege | Reading or editing another person's profile | RLS owner-only on `profiles`, `privacy_settings`, `consents`; column-level grants (no self-service age, avatar or deletion changes); others read only through `profile_cards`; 34 pgTAP checks                                                                                                                                                                                    | Group-scoped RLS (3)                                          |
| **E**levation of privilege | Clickjacking                                | `frame-ancestors 'none'`, `X-Frame-Options: DENY`                                                                                                                                                                                                                                                                                                                                 | —                                                             |

## Phase 2a additions

| Threat                     | Example                                                           | Mitigation                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S**poofing               | Under-18 or consent-less account via direct Auth API calls        | Database trigger requires a single-use sign-up ticket from the age and consent steps; Google users without a ticket are deleted in the callback; hourly orphan clean-up (D-014) |
| **S**poofing               | Open redirect after sign-in (`?next=//evil`)                      | `safeNextPath` accepts same-site paths only (unit-tested and e2e-tested)                                                                                                        |
| **T**ampering              | CSRF on sign-in and sign-out                                      | Server Actions (Origin check); the only GET that changes state signs out a session _without_ a profile                                                                          |
| **T**ampering              | Forged consent or age records                                     | No API role can insert or update `consents` or age fields; only security-definer functions write them                                                                           |
| **I**nformation disclosure | Account enumeration                                               | Sign-up, magic link, reset and resend give the same answer for known and unknown addresses                                                                                      |
| **I**nformation disclosure | Email link scanners using up tokens, or links leaking via Referer | Links open `/confirm`, which needs a button press; `Referrer-Policy: strict-origin-when-cross-origin` (D-020)                                                                   |
| **I**nformation disclosure | Session theft through XSS                                         | httpOnly session cookies; nonce CSP                                                                                                                                             |
| **I**nformation disclosure | Emails revealing the app's purpose                                | Discreet templates and sender name, checked by an e2e test                                                                                                                      |
| **D**enial of service      | Credential stuffing, email flooding                               | Rate limits per IP, per address and per user; Supabase Auth limits; Turnstile in production                                                                                     |

## Phase 2b additions

| Threat                     | Example                                                       | Mitigation                                                                                                        |
| -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **I**nformation disclosure | Reading someone's "my why" (database leak, admin, other user) | Encrypted in the app with AES-256-GCM before storage; author-only RLS; the key lives outside the database (D-025) |
| **T**ampering              | Moving one person's encrypted text onto another row           | The user id is bound into each value as associated data, so a moved value fails to decrypt                        |
| **T**ampering              | Skipping onboarding checks or forging `onboarded_at`          | Column not writable by members; only `complete_onboarding()` sets it, for the caller only                         |
| **I**nformation disclosure | Reminder or notification text revealing the topic             | Discreet mode on by default, with an explicit opt-out                                                             |

## Phase 2c additions

| Threat                     | Example                                                                       | Mitigation                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I**nformation disclosure | A shared photo reveals where someone lives (GPS) or which phone they use      | Every photo is decoded and re-encoded to WebP on the server; no metadata survives. An e2e test uploads a photo with GPS and checks every served size (D-026)                                   |
| **I**nformation disclosure | Reading someone's avatar or profile without sharing a group                   | Private bucket with no user policies; avatars served by `/api/avatar/<id>` only after `profile_cards` (RLS) allows it; 404 for hidden and missing alike; `private` cache only                  |
| **T**ampering              | Uploading HTML, SVG or a polyglot file as a "photo" (stored XSS)              | Magic-byte allow-list (JPEG, PNG, WebP); full decode with `failOn: "error"`; output is always freshly encoded WebP; served with `nosniff`, `Content-Security-Policy: sandbox` and a fixed type |
| **T**ampering              | Writing straight to storage, or pointing `avatar_path` at someone else's file | Members can't write storage or the avatar columns; paths must sit in the owner's own folder (database check)                                                                                   |
| **D**enial of service      | Decompression bombs, huge files, upload floods                                | 5 MB limit, 40-megapixel cap, 6 MB action body limit, 10 uploads an hour per person                                                                                                            |
| **E**levation / abuse      | Posting sexual content as an avatar                                           | Screened by Google Cloud Vision before anyone else sees it; anything possibly adult is refused and deleted; fails closed when screening is down or unconfigured                                |
| **I**nformation disclosure | Screening provider keeps or reads photos                                      | Only the 512 px re-encoded copy is sent, with no metadata or user id; key sent in a header. Listed as a processor in the privacy policy (pending legal review)                                 |
| **I**nformation disclosure | Audit log leaking profile text                                                | Audit rows record which privacy settings changed, never the text                                                                                                                               |

## Phase 2d additions

| Threat                     | Example                                                                 | Mitigation                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S**poofing               | Stolen or reused password                                               | Optional two-step sign-in (TOTP). `util.session_ok()` makes every personal table unreadable at aal1 when a factor exists, so the API is closed too, not just the pages (D-028) |
| **S**poofing               | Guessing two-step or recovery codes                                     | 5 wrong tries per 15 minutes per person (codes and recovery codes together), plus Supabase's own MFA limits; recovery codes have 50 bits and are single-use                    |
| **S**poofing               | A password-reset or magic link used to skip two-step sign-in            | Every first step, email links included, goes to the code page before anything else                                                                                             |
| **S**poofing               | Phishing                                                                | Passkeys (bound to our domain by the browser). They sign in at aal1, so a second factor is still asked for when one exists (D-029)                                             |
| **S**poofing / persistence | An attacker with a session adds a passkey or turns two-step sign-in off | Passkey changes need aal2 once two-step sign-in is on; emails for passkey added, two-step on/off, recovery code used and password changed                                      |
| **I**nformation disclosure | Recovery codes leaked from a database copy                              | Stored only as HMAC-SHA256 with a key derived from `APP_ENCRYPTION_KEY`, bound to the user id; private schema, never exposed to the API                                        |
| **I**nformation disclosure | A lost or shared device stays signed in                                 | Sessions page: sign out one device, all others or everywhere. A signed-out session is refused by the database on its next request, not when its token expires (D-030)          |
| **I**nformation disclosure | Unnoticed sign-in by someone else                                       | "New sign-in" email for a device the account hasn't used, sent after the first step (so a stolen password is noticed even when two-step sign-in stops it)                      |
| **I**nformation disclosure | Device tracking                                                         | A random device cookie, stored hashed; coarse labels ("Chrome on Windows"); no IP addresses stored or shown; device rows deleted a year after last use                         |
| **I**nformation disclosure | Security emails revealing the app's purpose                             | Sender "Aura", neutral subjects and text; checked by unit and e2e tests. Local and test mail never leaves the machine (Mailpit)                                                |
| **T**ampering              | Signing out someone else's session, or reading their device list        | `my_sessions()` and `revoke_my_session()` only touch the caller's own rows; device and recovery-code tables are in the private schema; pgTAP checks both                       |
| **D**enial of service      | Email flooding through sign-ins                                         | New-device emails only for devices not seen before; existing sign-in rate limits; emails sent after the response                                                               |
| **R**epudiation            | "I didn't turn that off"                                                | Audit log: two-step on/off, codes created and used, code failures, passkeys added, renamed and removed, sessions signed out (no IPs, no codes)                                 |

## Phase 2e additions

| Threat                     | Example                                                                 | Mitigation                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I**nformation disclosure | Someone downloads another person's data                                 | The export reads only through RLS as the signed-in person; `util.session_ok()` applies (two-step code, live session); e2e checks the contents (D-032)                                   |
| **I**nformation disclosure | A cross-site page makes a signed-in browser download, or log, an export | POST only; Origin must name this host and `Sec-Fetch-Site` be same-origin (403 otherwise, e2e-tested); SameSite=Lax cookies                                                             |
| **I**nformation disclosure | The export file leaks secrets                                           | No password hashes, factor secrets, recovery-code hashes, tokens or ciphertext; e2e checks for them. `private, no-store`. The page warns that the file holds private things             |
| **T**ampering              | A formula in a profile field runs when the CSV opens in a spreadsheet   | Cells starting with `= + - @`, tab or CR get a leading apostrophe (unit-tested)                                                                                                         |
| **D**enial of service      | Repeated exports to load the server                                     | 3 an hour per person; only signed-in people                                                                                                                                             |
| **S**poofing / tampering   | A stolen session deletes the account                                    | 14 days to keep it; a "your account will close" email; signing in shows "Keep my account". With two-step sign-in on, a password alone can't ask (`session_ok()`)                        |
| **T**ampering              | Someone else cancels a deletion the person asked for                    | Only the account's own live session can cancel; a "your account stays open" email; audit events for both                                                                                |
| **T**ampering              | Back-dating `deletion_requested_at` to erase at once                    | Members can't write the column; only `request_account_deletion()` sets it, to `now()`, and asking again keeps the first date (pgTAP)                                                    |
| **I**nformation disclosure | Erased data survives (files, audit links, sessions)                     | One cascade from `auth.users`; photo folders queued and removed through the Storage API; audit rows unlinked; e2e checks the auth user, profile, files and audit links are gone (D-033) |
| **E**levation of privilege | Calling the purge or reading the purge queue                            | Service-role-only functions; the queue is in the private schema; `/api/cron/account-purge` needs `CRON_SECRET` (timing-safe compare), 404 without one                                   |
| **R**epudiation            | "I never asked to delete my account" / "I didn't download that"         | Audit events: export, deletion requested, cancelled, storage purged, and an anonymous `account.deleted`                                                                                 |

## Headers sent on every response

`Content-Security-Policy` (pages, per-request nonce), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (production), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-Frame-Options: DENY`, and no `X-Powered-By`.

## Open items

- `require-trusted-types-for 'script'` is not enabled yet; test Next.js and React compatibility in Phase 11.
- There is no CSP violation reporting endpoint yet; add it alongside Sentry (Phase 12).
- `security.txt` and the disclosure page come in Phase 11.
- Turnstile is not exercised by automated tests (off in CI); verify it by hand on the first preview deploy (D-018).
- Supabase Auth applies its per-IP limits to our server's IP for server-side calls; set dashboard limits generously before launch (D-019).
- Back up `APP_ENCRYPTION_KEY` securely: without it, encrypted text can't be read (D-025).
- The app must run behind a proxy that overwrites `X-Forwarded-For` (Vercel, Cloudflare), or per-IP rate limits can be bypassed (D-019).
- Sign Google Cloud's data processing terms and name Google as a processor before launch; avatars are screened by Cloud Vision (D-026).
- Rejected photos are deleted immediately. Phase 11's written CSAM procedure must decide whether flagged images are preserved for reporting (NCMEC, cybercrime.gov.in) instead.
- Avatar screening runs in `after()` until Phase 7's job queue exists; a photo left pending is retried when its owner opens their profile (D-026).
- Security emails are sent in `after()` until Phase 7's job queue; a crash at that moment loses one alert (D-030).
- Until there is a domain, email goes through a dedicated Gmail account over SMTP (D-031). Its app password is a mailbox credential: keep it only in the host's environment and Supabase, and use that account for nothing else. Move to Resend with a verified domain when the app grows.
- Passkeys are a Supabase beta; set the production relying party (domain) in the dashboard, and keep `PASSKEYS_ENABLED` as the kill switch (D-029).
- Supabase's native MFA recovery codes are experimental and off locally; ours replace them for now (D-028).
- Two-step sign-in is optional; Phase 11 must require it for platform admins.
- Phase 3 onwards must fill in `private.anonymise_group_contributions()` and add their part to the data export (D-032, D-033).
- Until there is hosting with `CRON_SECRET`, photos of erased accounts wait in the private bucket (nothing can serve them); run `npm run accounts:purge` locally (D-033).
- Export and deletion don't ask for a fresh sign-in (owner's choice); revisit with the app lock (D-032).
