# Privacy and discretion review 1 (after security review 1)

**Scope:** everything on `main` after Phase 4 and security review 1, reviewed two ways: as a privacy officer (CLAUDE.md §2.3, §11, DPDP data minimisation), and as someone whose spouse, parent or roommate might pick up their phone or open their laptop. **Method:** went through every page title, the in-app chrome, every app and Supabase Auth email (subject, preview, body, sender), invite share text, downloads, cookie and storage names, URLs, error pages, log lines (`devLog`, `audit()`, the database's `util.audit`) and every table and column, including the ones Supabase Auth keeps for itself. Then a local Supabase stack, with real rows, to confirm what Supabase Auth actually stores.

Most surfaces were already discreet: tab titles use "Aura" and never a group name, the slip page's tab says "Check in", emails are neutral and sent as "Aura", the export downloads as `aura-data-<date>.zip`, invite shares say "Join my group on Aura", cookies are `aura_device` / `aura_invite` / `theme`, `devLog` is silent in production, audit metadata carries no content, and check-in notes are encrypted.

## Findings

| ID   | Severity | Finding                                                                                                                                                                           | Where (before the fix)                                                                                                           | Test                                                                                  | Fix   |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----- |
| PR-1 | **High** | Google sign-in kept the person's real name and Google photo in Supabase Auth, and in every access token                                                                           | `auth.users.raw_user_meta_data`, `auth.identities.identity_data` (nothing removed them)                                          | pgTAP `040_platform_privacy` (tests 1–8)                                              | D-056 |
| PR-2 | Medium   | Browser history (and the host's request logs) recorded which answer was given: a slip went to `/check-in/new-mercies`, a clean day to `/check-in/done`                            | `src/features/checkins/server/actions.ts:71`                                                                                     | `src/test/discretion.test.ts` (addresses); e2e `checkins.spec.ts` checks the same URL | D-055 |
| PR-3 | Medium   | The header of every app, sign-in, onboarding and error screen showed the full name "Holy Auramaxxxing", whose "xxx" reads badly at a glance, while tabs say "Aura"                | `src/components/shell/app-shell.tsx:18`, `_frames/auth-frame.tsx:31`, `(onboarding)/layout.tsx:36`, `error.tsx`, `not-found.tsx` | `src/test/discretion.test.ts` ("the name in the app's header")                        | D-055 |
| PR-4 | Medium   | Supabase Auth kept IP addresses and full browser strings, and finished OAuth flows that can hold Google's tokens, while the Privacy Policy says we keep no IPs                    | `auth.audit_log_entries.ip_address`, `auth.sessions.ip` / `user_agent`, `auth.mfa_challenges.ip_address`, `auth.flow_state`      | pgTAP `040_platform_privacy` (tests 9–14)                                             | D-057 |
| PR-5 | Low      | Rate-limit counters kept "when this person last saved a check-in" (and other last-activity times) forever                                                                         | `private.rate_limit_counters` (`20261010000200_platform_db_rate_limits.sql:18`)                                                  | pgTAP `040_platform_privacy` (test 15)                                                | D-057 |
| PR-6 | Low      | The Privacy Policy didn't name Google Cloud Vision (photo screening) or Google sign-in, or mention profile content; the export page didn't say it holds check-ins and their notes | `messages/en.json` (`legal.privacy`, `accountData.export.body`)                                                                  | (copy)                                                                                | D-058 |
| PR-7 | Low      | Group names show at the top of every member's screen, with no hint to keep them plain                                                                                             | `messages/en.json` `groups.fields.nameHint`                                                                                      | (copy)                                                                                | D-055 |

### PR-1 · Google's name and photo (high)

A Google sign-up writes `name`, `full_name`, `given_name`, `picture` and `avatar_url` into `auth.users.raw_user_meta_data` and the Google identity, and Supabase Auth writes them again at every sign-in. The app never reads them (people choose their own display name and photo), yet `user_metadata` is copied into every access token, so a real name travelled in the session cookie on every request, sat in the database next to sexual-behaviour data, and wasn't even in the data export. **Fix:** BEFORE INSERT/UPDATE triggers on both tables keep only `sub`, `iss`, `email`, `email_verified`, `phone_verified` and `provider_id`. Existing rows are cleaned by the migration. The sign-up ticket is still read first (BEFORE triggers run in name order; `on_auth_user_before_insert` < `on_auth_user_strip_profile`).

### PR-2 · The answer in the address bar (medium)

`/check-in/new-mercies?date=…` versus `/check-in/done?date=…`: anyone scrolling the browser history, or reading the hosting platform's request logs, could see which days were slips. **Fix:** both answers redirect to `/check-in/done?date=…`. The page reads the saved check-in and shows the grace page or the thank-you. `/check-in/new-mercies` no longer exists (it 404s). A unit test fails if any URL segment names the topic or an answer, or if the check-in action's redirect depends on the answer.

### PR-3 · The full name on every screen (medium)

**Fix:** the app's own chrome (app shell, sign-in frame, onboarding, error and 404 pages) shows "Aura", like the tab, emails and home-screen name. "Holy Auramaxxxing" stays on the public landing page and the legal pages, which are public anyway.

### PR-4 · IP addresses kept by Supabase Auth (medium)

Supabase Auth writes the client's IP into its audit trail (`auth.audit_log_entries`) and into `auth.sessions` and `auth.mfa_challenges`, plus the full User-Agent string into `auth.sessions`. Our sessions page and audit log use their own coarse device label ("Chrome on Android") and need none of this. `auth.flow_state` rows from OAuth sign-ins can hold the provider's access token. **Fix:** the hourly clean-up (`private.hourly_auth_maintenance`) now blanks session IPs and browser strings (nobody is signed out), blanks the audit trail's IPs and keeps only its last day, and removes two-step challenges and OAuth flows older than an hour. The Privacy Policy now says the sign-in provider sees the address while you sign in and it is cleared within the hour.

### PR-5 · Rate-limit counters as an activity log (low)

`private.rate_limit_counters` has one row per person and bucket with `window_started_at`, never removed, so it was a permanent record of when someone last checked in, joined or managed a group. **Fix:** rows whose window ended more than a day ago (the longest window) are deleted hourly.

### PR-6, PR-7 · Copy

The Privacy Policy now lists Google Cloud Vision and Google sign-in as processors, mentions profile content, says we keep only the email from Google, and describes the device name in security records. `POLICY_VERSION` is now `2026-10-08-draft`. The export page lists check-ins and their private notes. The group-name hint says the name shows at the top of members' screens, so a plain name keeps things discreet.

## For the owner (can't be fixed in code)

1. **Sending address.** Every email arrives from `holyauramaxxxing@gmail.com`. The display name is "Aura", but Gmail and phone mail apps show the address too. Before launch, create a neutral Gmail account (or verify a neutral domain with Resend) and update `SMTP_USER`, the host's environment and Supabase's custom SMTP.
2. **Domain.** Choose a domain without "xxx" or the topic in it. It sits in browser history, password managers and router logs, and the DNS content filters that the resources page will recommend (Phase 8) may block a domain containing "xxx".
3. **Google sign-in consent screen.** Name the Google Cloud OAuth app "Aura", with a neutral logo. That name shows on Google's sign-in screen and in the person's Google Account under third-party connections.
4. **Secrets on OneDrive.** The project folder on your PC is inside OneDrive, so `.env.local` and `.env.local.bak-before-vision-fix` (Gmail app password, Vision and Resend keys, `APP_ENCRYPTION_KEY`) are copied to Microsoft's cloud. Consider moving the project outside OneDrive, deleting the `.bak`, and rotating the Gmail app password and API keys once production keys exist.

## Checked, nothing to change

- **Tab titles:** neutral on every page (never a group name). The slip page's tab already said "Check in".
- **Emails:** neutral subjects, previews and bodies for the app's security alerts and all seven Supabase Auth templates; sender name "Aura" whatever address is set.
- **Downloads:** the export's file name and README are neutral. Its contents are sensitive by design (the person asked for them), and the page warns about that.
- **Invites:** the share text is "Join my group on Aura" and the QR file is `invite-qr.svg`. The invite page title is "Join a group" with `noindex` and no group name in metadata, so link previews show nothing.
- **Logs:** `devLog` prints only during `npm run dev`. `audit()` and `util.audit` metadata carry ids, counts, method names and a coarse device label, never content, emails, IPs or zones. No query string carries an answer.
- **After sign-out:** every app page is `Cache-Control: private, no-store`, and sign-out changes cookies, so Back can't restore a private page from cache.
- **Form autofill:** group name, invite code and check-in note have `autocomplete="off"`. Notes and other long text are textareas, which browsers don't keep in autofill history.
- **Tables:** check-ins keep only the fields §7.5 needs (the zone per row is needed for the answer window). `known_devices` is a hash of a random cookie plus "Chrome on Windows". Signup tickets, audit entries, devices and session marks all have retention in the hourly clean-up. Avatars rejected by screening are deleted at once.
- **Not built yet:** notifications, push, the manifest and share cards. Their requirements are below.

## Requirements carried forward

- **Phase 5:** level-up and share cards, and the challenge certificate, must not show streak counts or the topic. Add their text to `src/test/discretion.test.ts`. A level drop is never shown to anyone else (§7.6).
- **Phase 7:** add every notification, push and digest template, in discreet mode, to `src/test/discretion.test.ts` (the Phase 7 prompt asks for exactly this test). Push titles use "Aura". The quiet-hours exception for partner SOS must still be discreet.
- **Phase 8:** the resources page's DNS-filter advice should be checked against our own domain.
- **Phase 9:** manifest `name` and `short_name` "Aura", `apple-mobile-web-app-title` "Aura", `start_url` `/home` (not the public landing page), and install-sheet screenshots made from sample data, with no topic words.
- **Phase 10:** the app lock (PIN or biometrics) is the main protection when someone else holds the unlocked phone. Until then, anyone with the phone sees Home and Progress.
- **Phase 12:** Sentry must scrub query strings and request bodies as well as PII. URLs carry dates, and the server-action bodies carry answers.
