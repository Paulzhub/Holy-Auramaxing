# Security review 1 (after Phase 4)

**Scope:** everything merged to `main` up to Phase 4 (check-ins), reviewed as a hostile outsider against CLAUDE.md §10 and OWASP ASVS 5.0 Level 2. There was no earlier review, so "changes since the last review" means the whole codebase. **Method:** reading every migration, route handler and server action; probing a local Supabase stack directly with the publishable key and real user tokens (the way an attacker would, skipping the app); then writing a failing test for each finding before fixing it.

## Findings

| ID   | Severity | Finding                                                                                    | Where (before the fix)                                                                                                                                                         | Failing test                                                                     | Fix   |
| ---- | -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----- |
| SR-1 | **High** | Two-step codes can be guessed directly against Supabase Auth, past the app's 5-tries limit | `supabase/migrations/20261006000200_auth_security.sql:39` (`util.session_ok()` trusted any aal2 token)                                                                         | `supabase/tests/database/016_auth_mfa_session_marker.test.sql`                   | D-050 |
| SR-2 | Medium   | Every write function can be called through the Data API, skipping the app's rate limits    | `supabase/migrations/20261008000200_groups_functions.sql:60` (`lock_group`), `20261009000200_checkins_functions.sql:371` (`submit_checkin`), and `create_group` / `join_group` | `supabase/tests/database/025_platform_db_rate_limits.test.sql`                   | D-051 |
| SR-3 | Medium   | Per-network limits keyed on a client-chosen `X-Forwarded-For` entry                        | `src/lib/security/request-info.ts:10`                                                                                                                                          | `src/lib/security/request-info.test.ts`                                          | D-052 |
| SR-4 | Low      | "5 wrong tries" limits can be passed by sending tries at once                              | `src/features/auth/server/actions.ts:206`, `src/features/groups/server/actions.ts:472`                                                                                         | `src/test/rate-limit-races.test.ts`                                              | D-053 |
| SR-5 | Low      | Decryption accepts truncated (4-byte) GCM tags                                             | `src/lib/security/encryption.ts:40`                                                                                                                                            | `src/lib/security/encryption.test.ts` ("refuses a truncated authentication tag") | D-054 |

### SR-1 · Brute-forcing two-step sign-in (high)

With only the password, sign in to Supabase Auth directly (`/auth/v1/token`), then loop `/auth/v1/factors/:id/challenge` + `/verify`. Locally, 40 wrong codes in a row were all answered 422 (no lock-out) and the right code then returned aal2 tokens, which `util.session_ok()` accepted, so every table opened. Hosted Supabase limits these endpoints to 15 requests a minute **per IP address** and the limit can't be changed. About 3 codes are valid at any moment, so each address has roughly a 3% chance a day, and a few dozen addresses get in within a day. The app's own limit of 5 wrong codes per 15 minutes never ran. Supabase's MFA verification hook could limit this, but only on the Team plan.

**Fix:** the database gate now also needs a mark that only the app's server writes, after its own rate-limited code check (`mark_session_mfa_verified`, secret key only). Re-running the attack after the fix: the directly upgraded session reads `[]` from `profiles`, and `auth_gate()` reports `mfa_pending: true`.

### SR-2 · Rate limits only in the app (medium)

Any signed-in person has an access token, and the publishable key is public, so `POST /rest/v1/rpc/<function>` skips the server actions. 100 direct `submit_checkin` calls and 200 `update_my_group_membership` calls all succeeded and wrote 299 audit rows; the app allows 30 and 120 an hour. That means unbounded writes, audit-log growth and DB load, and Phase 6's posts, reactions and nudges would inherit the gap.

**Fix:** `private.throttle()` in the check-in and group write functions, a little above the app's limits, answering HTTP 429. After the fix, 60 direct check-in calls returned 40 × 200 and then 20 × 429.

### SR-3 · Spoofable client address (medium)

`clientIp()` took the first `X-Forwarded-For` entry. Proxies that append (Cloudflare, nginx) leave the client's own value first, so `X-Forwarded-For: <random>` gave a fresh sign-in, sign-up, email and invite-code allowance on every request. The planned Cloudflare-in-front-of-Vercel setup also makes Vercel see Cloudflare's address, which would lump many visitors into one limit.

**Fix:** read only the header the platform writes (`TRUSTED_IP_HEADER`; unset means the last `X-Forwarded-For` entry; `cf-connecting-ip` behind Cloudflare).

### SR-4 · Check-then-count races (low)

Sign-in and invite-code entry peeked at the failure count, did the slow check, then counted. Twenty concurrent requests all saw zero: the test counted 20 password checks and 20 code lookups where 5 were allowed. Supabase's own limits and the 50-bit code space keep the real-world impact low, but the stated limit didn't hold.

**Fix:** count first, then give the try back with `refund()` if it was right.

### SR-5 · Short GCM tags (low)

Node's `createDecipheriv("aes-256-gcm")` accepts tags of 4 to 16 bytes unless `authTagLength` is set. Today only the server writes notes, so this is defence in depth, but `profile_private.my_why_encrypted` is client-writable for its owner.

**Fix:** `authTagLength: 16` on both sides, and other lengths are refused.

## What held up (attacked, no finding)

Run as two owners and a member against the live local API (46 attacks, 0 leaks):

- **Another group's data:** every group table, `group_checkins_today`, `group_member_stats`, profiles, check-ins, user stats, private text, consents, settings, and GraphQL, read with another group's ids. All came back empty or 403. RLS plus the security-definer view filter by active membership in that group.
- **Another person's check-in notes or journal:** `checkins` and `profile_private` are owner-only, notes are AES-GCM encrypted with `checkin-note:<user>:<date>` as AAD, and the share-level view never exposes notes. Journals don't exist yet.
- **Member to admin:** `set_group_member_role`, `transfer_group_ownership`, `create_group_invite`, `remove_group_member`, `update_group_details`, `update_group_challenge` and covenant functions as a member, plus `PATCH group_members` (no write grants): all 403. A non-member calling these with another group's ids gets `group_not_found`.
- **Invites:** tokens are 160-bit and SHA-256 hashed; codes are 50-bit and HMAC'd with a server key, so they can't be brute-forced through the API without that key. Hash columns are never granted. `join_group` locks the group then the invite, so the last use can't be taken twice. Removed members can't rejoin by invite. The anonymous preview returns only the name and member count.
- **Script injection:** all user text is rendered by React (no `dangerouslySetInnerHTML` except the nonce'd theme script and the server-drawn QR SVG, whose label is escaped). There's a nonce CSP with `strict-dynamic` and no inline styles. Uploads are re-encoded by sharp with a pixel limit, as WebP only, into private buckets, served with `default-src 'none'; sandbox`. There are no SVG uploads.
- **Secrets:** nothing secret in git history (only `.env.example` files). A built client bundle on the owner's PC was searched for the values of `SUPABASE_SECRET_KEY`, `APP_ENCRYPTION_KEY`, `GOOGLE_CLOUD_VISION_API_KEY`, `CRON_SECRET`, `SMTP_PASSWORD` and `RESEND_API_KEY`: 0 hits. `readServerEnv()` throws in the browser.
- **CSRF:** Server Actions check Origin; the export route checks Origin and `Sec-Fetch-Site`; the only GET with side effects (`/api/auth/sign-out`) acts only on accounts that never finished sign-up.
- **Function privileges:** every function `anon` or `authenticated` can execute was listed. `private` has no USAGE grant, `util` isn't exposed through the API, and only `preview_group_invite` is open to `anon`.

## Accepted or for the owner to decide

- **Time-zone hopping** (switching to UTC+14 or −12 to answer one extra day) is already accepted in D-047. It's unchanged.
- **Password lock-out outside the app:** the 5-wrong-passwords limit lives in the app. Someone calling Supabase Auth directly meets Supabase's per-IP limit (hosted: 150 token requests per 5 minutes) and, once it's on, Turnstile. **Turn Turnstile on in the Supabase dashboard before launch** (D-018).
- **`NEXT_PUBLIC_SITE_URL` must be set in production.** Without it, auth email links fall back to the request's Origin header. Supabase's redirect allow-list still blocks foreign hosts.
- **Local secrets:** the owner's `.env.local` (and `.env.local.bak-before-vision-fix`) hold a real Google Cloud Vision key inside a OneDrive-synced folder. They're git-ignored and never committed, but OneDrive copies them to the cloud. Consider restricting that key to the Vision API and to known referrers, or moving the project out of OneDrive.

## Verification

- pgTAP: 481 checks (24 new), all passing; `supabase db lint` clean.
- Vitest: 275 tests (11 new), all passing; typecheck, ESLint and Prettier clean.
- Playwright: sign-in, two-step sign-in and setup, invites, isolation, check-ins and data export, re-run against a production build.
- The SR-1 and SR-2 attack scripts were re-run after the fix and are now refused.
