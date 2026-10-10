# Decisions

Departures from, or interpretations of, `CLAUDE.md`. Newest last. Each entry: context, decision, consequences.

## D-001 · Phase 1 · App name, region and discreet tab name

- **Context:** CLAUDE.md had `[APP_NAME]`, `[DOMAIN]` and `[REGION]` placeholders. Principle 3 says browser tab titles must never reveal the topic.
- **Decision:** The app is **Holy Auramaxxxing**, and the Supabase region is **Mumbai (`ap-south-1`)**. The domain is not chosen yet (`NEXT_PUBLIC_SITE_URL`). Browser tab titles and `application-name` use the short, neutral name **"Aura"** (`app.tabName` in `messages/en.json`). The full name appears inside the app.
- **Consequences:** Changing either name is a one-line edit in `messages/en.json`. A unit test and an e2e test check that tab titles contain no sensitive words. The PWA manifest name (Phase 10) should follow the same rule.

## D-002 · Phase 1 · Package manager and Node version

- **Decision:** npm with a committed `package-lock.json`. Node 24 LTS in CI (`.nvmrc`), and `engines` allows Node 22.12 or newer.
- **Why:** npm needs no extra install on Windows, and `npm ci` is reproducible.

## D-003 · Phase 1 · One migrations folder, module-prefixed names

- **Context:** CLAUDE.md §5 says each module owns its migrations, but the Supabase CLI only reads `supabase/migrations/`.
- **Decision:** Keep one folder, and name every file `<timestamp>_<module>_<what>.sql` (for example `…_groups_create_tables.sql`). Shared helpers use the `platform_` prefix. pgTAP tests follow the same rule in `supabase/tests/database/`.
- **Consequences:** Ownership is visible in the file name. The Phase 3 review should add a CI check that new migration names carry a known module prefix.

## D-004 · Phase 1 · UUIDv7 via `util.uuid_v7()`

- **Context:** IDs must be UUIDv7, but Supabase runs Postgres 17, which has no built-in `uuidv7()`.
- **Decision:** A PL/pgSQL `util.uuid_v7()` (RFC 9562) in a private `util` schema that isn't exposed to the API, with pgTAP tests for version, variant, ordering and uniqueness.
- **Consequences:** Swap it for the native `uuidv7()` when Supabase moves to Postgres 18.

## D-005 · Phase 1 · Native `<dialog>` for dialogs and bottom sheets

- **Context:** CLAUDE.md allows Radix UI or shadcn/ui.
- **Decision:** Dialog and bottom sheet are built on the native `<dialog>` opened with `showModal()`. The browser makes the rest of the page inert, traps focus, closes on Escape and uses the top layer, with no JavaScript library needed. Radix is used for Tabs, which has keyboard behaviour that is worth not re-implementing.
- **Consequences:** Smaller bundle and fewer edge cases. Entry animations use `@starting-style` and simply don't animate in older browsers.

## D-006 · Phase 1 · Theme saved in a cookie (plus a local cache)

- **Context:** The theme must apply with no flash and persist. CLAUDE.md says "saved to the profile and a local cache"; profiles arrive in Phase 2.
- **Decision:** A non-HttpOnly `theme` cookie (`light` | `dark` | `system`, one year, SameSite=Lax) is the source of truth. The server renders `data-theme` from it, so the first HTML is already right. `localStorage` is only a cache: an inline, nonce-allowed boot script restores the cookie from it if the cookie is cleared. Without JavaScript, the switcher posts to a Server Action, which Next.js protects against CSRF.
- **Consequences:** Pages read cookies, so they render dynamically (they already do, because of the CSP nonce). In Phase 2 the profile's `theme_pref` becomes the source of truth for signed-in users and is synced into the cookie at sign-in.

## D-007 · Phase 1 · CSP: nonces, plus two hashed style attributes

- **Decision:** Every page gets a fresh 128-bit nonce from `src/proxy.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'nonce-…'`, `frame-ancestors 'none'`, `object-src 'none'`. Radix server-renders two inline style attributes (`outline:none` and `animation-duration:0s`). Instead of allowing `'unsafe-inline'`, `style-src-attr` permits exactly those two values by hash (`'unsafe-hashes'`).
- **Consequences:** Nonces need dynamic rendering, so no page can be statically cached at a CDN. That's right for the private app. For public marketing pages (Phase 9), re-evaluate hash-based CSP (Next's experimental SRI) so they can be cached. Any new server-rendered inline style attribute will show up as a CSP error, which the e2e console guard catches, and needs a reviewed hash.

## D-008 · Phase 1 · Lighthouse SEO on private pages

- **Context:** App pages must be `noindex` (§12), and Lighthouse deducts SEO points for `noindex`. That makes "95+ SEO on the shell" and "never index the app" contradict each other.
- **Decision:** Lighthouse runs in two configurations. The public page (`/`) is scored with every audit. App pages (`/home`, `/settings`) skip only the `is-crawlable` audit. A Playwright test separately asserts that every app page is `noindex` and the public page is not.

## D-009 · Phase 1 · Fonts

- **Decision:** Self-hosted, Latin-subset fonts via `next/font/local`, both under the SIL Open Font License (`src/fonts/OFL-*.txt`):
  - **Fraunces** for display headings: a static weight-600, fully-soft instance subset to Latin. It is 17 KB instead of 62 KB for the variable file, and `scripts/build-display-font.sh` rebuilds it.
  - **Atkinson Hyperlegible Next** (variable) for UI text.
- Both are preloaded with `font-display: optional` and metric-matched fallbacks. On a fast or repeat visit the brand fonts are used. On a slow first visit the page keeps the fallback rather than swapping fonts mid-read. That avoids layout shift and a late re-paint, and it keeps the Largest Contentful Paint early.

## D-010 · Phase 1 · JavaScript budget: dropped `tailwind-merge` and `zod` from the browser bundle

- **Context:** §14 budgets under 170 KB of compressed JavaScript on the first load of app routes. The first build shipped about 182 KB.
- **Decision:** (1) Removed `tailwind-merge`. Components are styled with CSS classes, so a plain `clsx` join is enough. (2) Kept `zod` server-side only. Client modules use a plain type guard. (3) Turned on next-intl's experimental message precompilation, so the ICU parser never ships to browsers.
- **Result:** App routes load about 168 KB of compressed JavaScript; most of that is the React and Next.js runtime. Keep an eye on this as features land, and move non-critical client code behind `dynamic()` imports.

## D-011 · Phase 1 · `/dev/components` in production builds

- **Decision:** The gallery is on in `npm run dev` and when `ENABLE_DEV_PAGES=true`, as in CI for the axe tests. Otherwise it returns 404. It is also `noindex`.

## D-012 · Phase 1 · Toast timing

- **Context:** WCAG 2.2.1 says no time limits.
- **Decision:** Info and success toasts close after 8 seconds and pause while hovered or focused. Error toasts stay until dismissed. Nothing important exists only in a toast: Phase 7 keeps every notification in the notification centre.
- **Superseded by D-060** (accessibility review 1): no toast closes on a timer.

## D-013 · Phase 2a · No new dependencies for auth

- **Context:** The Phase 2 plan allowed `@upstash/ratelimit` and `@upstash/redis`.
- **Decision:** Neither is needed. Rate limits call Upstash's REST API with `fetch` (three commands in one pipeline). The breached-password check, the Turnstile widget and the session-cookie helper are small, local modules. Phase 2a adds no packages.
- **Consequences:** Less supply-chain surface and no bundle cost. `sharp`, React Email and Resend arrive with 2c and 2d as planned.

## D-014 · Phase 2a · The age gate and consent are enforced by the database

- **Context:** "Choosing under 18 cannot create an account" must hold even if someone calls Supabase Auth directly.
- **Decision:** The age and consent steps issue a single-use **sign-up ticket**: a 256-bit random token in an httpOnly cookie, with only its SHA-256 hash stored in `private.signup_tickets`, valid for 30 minutes.
  - **Email sign-up:** a `BEFORE INSERT` trigger on `auth.users` refuses any email sign-up without a live ticket. The `AFTER INSERT` trigger then creates the profile, the default privacy settings and two consent rows (`terms_privacy` and `sensitive_data`, with the policy version). The token is stripped from user metadata and identity data, so it never appears in a JWT.
  - **Google sign-in:** Supabase creates the auth user before our callback runs. The callback finishes the account with `complete_oauth_signup()` when there is a ticket. Without one, it deletes the new auth user at once. An hourly `pg_cron` job removes any auth user still without a profile after an hour.
  - **"Under 18":** stores nothing and sets no cookie (DPDP: no tracking of children).
- **Consequences:** Every account has an 18+ confirmation and recorded consent, which pgTAP proves. Admin-created users need a ticket too; the test helpers show how.

## D-015 · Phase 2a · Sessions

- **Decision:**
  - Session cookies are httpOnly, SameSite=Lax and Secure in production. Nothing in the browser reads the session; every Supabase call that needs it runs on the server.
  - Access tokens last 10 minutes (`jwt_expiry = 600`), so "sign out everywhere" (2d) takes effect quickly. Refresh tokens rotate, and reuse is detected.
  - `src/proxy.ts` refreshes the session on each page request and redirects signed-out visitors away from app pages. Layouts, pages and Server Actions check again (`requireAccount`), and RLS checks once more.
  - Pages are sent with `Cache-Control: private, no-store`.
- **Consequences:** A future feature that needs the session in the browser (for example Realtime in Phase 7) must get a short-lived token from the server rather than reading cookies.

## D-016 · Phase 2a · The audit log stores no IP addresses

- **Decision:** `audit_log` records the action, the actor, a coarse device description ("Chrome on Android") and small non-sensitive metadata. It stores no IP addresses, emails or tokens. Rows are kept for one year (hourly clean-up). Only the service role can write; nobody can read it through the API until the Phase 11 admin tools.
- **Why:** The more private option (CLAUDE.md §15). Rate limiting uses IPs only as hashed, expiring keys.

## D-017 · Phase 2a · Breached-password check fails open

- **Decision:** The app checks every new password with the Have I Been Pwned range API (k-anonymity: only the first 5 characters of the SHA-1 hash leave the server, with padding). If the service is unreachable within 2.5 seconds, the password is accepted. `HIBP_DISABLED=true` skips the check for offline development.
- **Why:** An outage at a third party shouldn't stop people signing up. Supabase's own leaked-password protection (Pro plan) can be turned on as a second layer.

## D-018 · Phase 2a · Turnstile

- **Decision:**
  - Supabase Auth verifies the Turnstile token (its built-in captcha support) on sign-up, sign-in, magic links, resends and password resets. The widget runs in "interaction-only" mode, so most people never see a challenge (WCAG 3.3.8).
  - Turnstile is **off locally and in CI**. The widget renders only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set, and the CSP allows `challenges.cloudflare.com` only then.
- **To turn it on in production:** set the site key in the hosting environment, and enable Turnstile with the secret key in the Supabase dashboard (Authentication → Attack protection).
- **Known gap:** No automated test exercises the live widget. Test it by hand on the preview deploy.

## D-019 · Phase 2a · Rate limits and client IPs

- **Decision:**
  - Fixed-window limits per IP, per email address and per user, in `src/lib/security/rate-limit.ts`. They use Upstash Redis when it is configured, and otherwise a per-process in-memory store (development and tests).
  - After 5 wrong passwords for an address, it is locked for 15 minutes. A successful sign-in clears the count.
  - Keys are hashed.
- **Requirement:** The app must sit behind a proxy that overwrites `X-Forwarded-For`, as Vercel and Cloudflare do. Otherwise clients could choose their own rate-limit key.
- **Watch before launch:** Supabase Auth sees our server's IP for server-side calls. Its per-IP limits therefore apply to all users together, so set them generously in the dashboard; the per-person limits above do the real work. Local values are raised in `supabase/config.toml` for the test suite.

## D-020 · Phase 2a · Email links land on a confirmation page

- **Decision:** Every Auth email links to `/confirm?token_hash=…&type=…`, which asks for one press of **Continue** (a Server Action calls `verifyOtp`). The link is never used up by a GET request.
- **Why:** Email security scanners open links. Verifying on GET would let a scanner use up the one-time token before the person does. This also works when the link is opened on a different device from the one used to sign up (no PKCE verifier needed).
- **Emails** are discreet: the sender is "Aura", the subjects are neutral, and nothing says what the app is for (`supabase/templates/`). An e2e test checks the email body for sensitive words.

## D-021 · Phase 2a · Form validation

- **Decision:** Forms keep `required`, `type` and `autocomplete` for meaning and for password managers, but use `noValidate`. Validation happens in the Server Action (Zod), and errors come back as an error summary: `role="alert"`, focused, with each error linked to its field. Each field also shows its own message. No browser validation bubbles, which screen readers announce inconsistently.
- Password fields use the stable ids `current-password` and `new-password`, have a Show password toggle (`aria-pressed`), and never block paste.

## D-022 · Phase 2a · Profile visibility through `profile_cards`

- **Decision:**
  - `profiles` and `privacy_settings` are owner-only through RLS, plus column-level grants. Owners can edit only their handle, display name, bio, testimony, verse, time zone, locale and theme. Age confirmation, avatar status, deletion and onboarding change only through server functions.
  - Other people read `public.profile_cards`, a `security_barrier` view that applies each field's visibility. It uses `util.shares_group()` and `util.are_partners()`, which return false until Phases 3 and 6 replace them.
  - Accounts scheduled for deletion disappear from cards at once.
- **Defaults** (most private where personal): profile, bio and verse are visible to groups; the testimony is visible to partners only; the default share level is check-in only.
- **Data-model additions (approved in the Phase 2 plan):**
  - `profiles`: `onboarded_at`, `deletion_requested_at`, `avatar_status`, `updated_at`.
  - `privacy_settings`: `bio_visibility`, `testimony_visibility`, `verse_visibility`.
  - A `private` schema (never exposed) holding `signup_tickets` and `reserved_handles`.

## D-023 · Phase 2a · JavaScript budget: split entry points and scoped messages

- **Context:** The first 2a build shipped about 179 KB of compressed JavaScript on app routes, over the 170 KB budget.
- **Decision:**
  1. Each feature module has two public entry points: `@/features/<module>` for server code and server components, and `@/features/<module>/ui` for client components. That way, importing `requireAccount` in a layout doesn't pull the sign-in forms into every page. ESLint enforces it.
  2. Client components receive only the message namespaces they use (`src/i18n/client-messages.ts`). The auth layout adds `auth`, the gallery adds `dev`, and legal copy never reaches the browser.
  3. `global-error.tsx` uses a five-string subset (kept equal to `en.json` by a test) instead of importing every message.
  4. Sign-out is a plain form with no client JavaScript.
- **Result (Lighthouse transfer size, including headers):** `/home` and `/settings` 164.7 KB, `/sign-in` and `/sign-up` 168.7 KB, `/` 160.6 KB. Every Lighthouse category scores at least 96.

## D-024 · Phase 2a · Lighthouse and e2e run signed in

- **Decision:**
  - Playwright has a `setup` project that creates a confirmed test member through the real ticket path and signs in through the form. App specs reuse that session, and auth specs run signed out.
  - `npm run lighthouse` audits the public page, the sign-in and sign-up pages (signed out), and `/home` and `/settings` (signed in). `scripts/lighthouse-session.mjs` signs in a local test member and writes a config with its cookie into `.lighthouseci/`; it refuses to run against a non-local Supabase.
  - The e2e and Lighthouse CI jobs start local Supabase.

## D-025 · Phase 2b · Onboarding and application-level encryption

- **Onboarding** lives at `/welcome` and has five steps, each optional:
  1. Welcome: a grace message, a verse and a display name.
  2. "My why": private.
  3. Reminder time and time zone.
  4. Discreet mode: on by default.
  5. Groups: a placeholder until Phase 3.

  "Skip setup" in the header finishes at any time. The app layout sends anyone with `profiles.onboarded_at` unset to `/welcome`. Email confirmation and a first Google sign-in land there directly. `public.complete_onboarding()` is the only way to set `onboarded_at`; members can't write that column.

- **New tables** (data-model additions approved in the Phase 2 plan):
  - `profile_private`: the encrypted "my why", readable only by its author. Admins can't read it either.
  - `notification_settings`: reminder time, discreet mode and quiet hours (22:00–07:00). Every account gets a row at sign-up, existing ones were backfilled, and Phase 7 extends it.
- **Encryption:** `src/lib/security/encryption.ts`, AES-256-GCM with a random 96-bit IV per value.
  - The user's id is bound in as associated data, so a value copied to another row won't decrypt.
  - The format is `v1:<iv>:<tag>:<ciphertext>`; the version allows key rotation later.
  - The key comes from `APP_ENCRYPTION_KEY` (32 bytes, base64), an environment secret. It stays outside the database and Git; the spec allows "Vault or a KMS" and this is the KMS-style option.
  - The database refuses anything not in the encrypted format.
  - **Losing the key makes stored text unreadable.** Keep a secure backup of the production key.
- **Time zones:** the dropdown lists the runtime's IANA zones, plus UTC and the person's current zone, so their real setting always shows. Postgres validates the value (`profiles` trigger).

## D-026 · Phase 2c · Avatars, screening and the profile editor

- **Screening provider:** Google Cloud Vision SafeSearch, chosen by the owner on 2026-10-05 over self-hosted NSFWJS (better accuracy, no server to run, low cost at our volumes). It sits behind a small `ImageScreener` interface (`src/features/profile/avatar/screening.ts`), so swapping providers touches one file.
  - **Policy (zero tolerance, §7.11):** refuse if `adult` is POSSIBLE or higher, or `racy` or `violence` is LIKELY or higher.
  - **Fails closed:** if Google is down, errors, or no key is configured in a production build, the photo stays pending and is never shown. It is retried whenever its owner opens their profile.
  - **Configuration:** `GOOGLE_CLOUD_VISION_API_KEY` (server-only, restricted to the Vision API, sent in the `x-goog-api-key` header, never the URL). `IMAGE_SCREENING_PROVIDER=stub` is used by `npm run dev` and the e2e suite: it approves everything except a solid magenta image, so tests can exercise a rejection without calling Google.
- **Pipeline:**
  1. **Browser:** square crop with sliders (no drag-only control), shrink to 768 px, WebP (JPEG on older Safari). HEIC is converted here when the browser can decode it (Safari); other browsers show a kind message. The cropper loads only when a photo is picked.
  2. **Server:** 5 MB limit, magic-byte allow-list (JPEG, PNG, WebP; never SVG or HEIC), full decode with sharp (`failOn: "error"`, 40-megapixel cap), EXIF orientation applied, then three square WebP sizes (96, 256, 512 px). Re-encoding removes all metadata, GPS included.
  3. **Storage:** private `avatars` bucket with no user policies; only the server writes. Files are `<user id>/<128-bit random>-<px>.webp`.
  4. **Screening:** runs in `after()`, once the response is sent. Phase 7's job queue takes it over.
  5. **Publish:** only an approved photo becomes `avatar_path`. The old avatar stays visible while a new one is checked. Rejected photos are deleted at once; the person sees one gentle line.
- **Serving:** `/api/avatar/<id>?px=&v=` checks `profile_cards` as the viewer (so privacy settings and group membership decide), then streams the file with `private` caching, `nosniff`, `Content-Security-Policy: sandbox` and `Cross-Origin-Resource-Policy: same-origin`. Hidden, unknown and missing avatars all return 404; signed-out requests 401.
  - **Departure from §10 ("a separate storage domain"):** files are stored on Supabase's domain but served through the app's own origin. Serving them only after a permission check matters more for a private app, and every file is a re-encoded WebP sent with `nosniff` and a sandbox CSP, so it can never run as a page. Revisit if user uploads ever include other file types.
- **Data-model additions:** `profiles.avatar_pending_path`; a check that both avatar paths sit in the owner's own folder; `avatar_status` loses the unused `processing` value. `profile_cards` now shows `avatar_path` whenever it is set.
- **Server Action body limit** raised to 6 MB (for no-JavaScript uploads of an original photo). Each action still has its own rate limit.
- **Profile editor:** `/me/edit`. Every optional field has its own "who can see this" control; the privacy section covers profile visibility, leaderboards and the default share level. Writes go through RLS as the user. The audit log records which privacy settings changed, never the text.
- **Zod in the browser:** client components took constants from Zod schema files, which shipped Zod (and its CSP-breaking `eval` check) to `/welcome` since 2b. Constants now live in `src/features/profile/limits.ts`, and `src/test/client-bundle.test.ts` fails if any client component pulls in Zod again.
- **JavaScript budget:** `/me/edit` loads 159 KB of JavaScript at gzip -9 (170.9 KB in Lighthouse's local measure, which includes headers and `next start`'s lighter compression). That is within the 170 KB budget, but the closest page so far; move heavier editor parts behind `import()` if it grows.
- **`audit()` moved** from the auth module to `src/lib/server/audit.ts`, since every module writes to the platform audit log. It now also works inside `after()`, where request headers are unavailable.

## D-027 · Phase 2c · Accountability settings belong to the group, not the person

- **Context:** The 2c editor offered two per-person settings from the spec: "Show me on group leaderboards" and a default share level for check-ins. The owner felt they weaken accountability, which is the point of joining a group.
- **Decision (owner, 2026-10-06):** each group decides, as part of its covenant.
  - Phase 3 adds `groups.min_share_level` (checkin_only / streak / full) and `groups.leaderboard_hiding_allowed`. Both are shown with the covenant before someone joins, so taking part is still an informed choice.
  - A member may share more than the group's minimum, never less.
  - `privacy_settings.show_in_leaderboards` and `default_share_level` are dropped (migration `20261006000100`), and the two controls are gone from `/me/edit`.
  - CLAUDE.md §6, §7.4 and §7.6 are updated to match.
- **Unchanged:** profile visibility and per-field visibility stay personal. Privacy by default (§2.3) still holds for anything outside a group's covenant, and a level is still shown only at the streak or full share level, so a 10-level drop never gives away a slip at check-in-only groups.

## D-028 · Phase 2d · Two-step sign-in (authenticator app) and recovery codes

- **Decision (owner, 2026-10-06):** two-step sign-in with an authenticator app (TOTP), through Supabase Auth MFA. It is optional for members (§7.1) and will be required for platform admins in Phase 11.
- **Setting it up:** Settings → Security shows a QR code and the key to type in, and the person confirms with a code. Ten recovery codes follow, shown once. Supabase emails "Two-step sign-in is on/off" itself (D-030).
- **Signing in:** every first step (password, email link, Google, passkey) goes to `/sign-in/verify` for the code. That includes password-reset links: a reset email alone doesn't get past two-step sign-in. Codes and recovery codes share one limit: 5 wrong tries per 15 minutes per person.
- **Enforced three times:**
  1. **App:** `requireAccount()` sends anyone at aal1 who has an authenticator to `/sign-in/verify`.
  2. **Database:** `util.session_ok()` is a RESTRICTIVE policy on every personal table, and is inside `util.can_see()` (profile cards, and Phase 3's group checks). A session that has a verified TOTP factor but isn't at aal2 reads and writes nothing. A stolen password alone therefore can't reach anything through the API either.
  3. The proxy is unchanged. To learn whether someone has a factor it would need a database call on every request; `requireAccount()` already runs on every app page.
- **Recovery codes are our own** (`private.mfa_recovery_codes`):
  - Supabase's native recovery codes are experimental. They are turned off in the local auth server (v2.197.0), and the CLI has no setting for them, so they can't be tested here. Revisit when they're stable.
  - Codes are 10 characters of Crockford base32 (50 bits). They are stored as HMAC-SHA256, keyed with HKDF(`APP_ENCRYPTION_KEY`, "mfa-recovery-codes-v1") and bound to the user id, so a database copy alone can't be brute-forced.
  - Only aal2 sessions can create codes (the database checks). Only the server (secret key, rate-limited) can redeem them.
- **Using a recovery code** signs the person in, removes their authenticator factor (they've probably lost the phone), deletes the remaining codes, signs out every other session, and sends a "recovery code used" email. They are then asked to set the app up again.
- **Consequences:**
  - With two-step sign-in on, the profile is unreadable at aal1. The Google callback therefore checks "does this account exist?" with the secret key. A missing profile there would otherwise look like an unfinished sign-up and delete the account (D-014).
  - Changing passkeys also needs aal2 once an authenticator is set up: the auth server says so.

## D-029 · Phase 2d · Passkeys through Supabase Auth (beta)

- **Decision (owner, 2026-10-06):** Supabase's native passkeys (`auth.passkey.*`, `[auth.passkey]` + `[auth.webauthn]` in `config.toml`), with no `@simplewebauthn`.
- **The ceremony is split:**
  - Server Actions call `startAuthentication`/`startRegistration` and `verifyAuthentication`/`verifyRegistration`, so session tokens stay in httpOnly cookies (D-015).
  - The browser only runs `navigator.credentials`. `src/features/auth/webauthn.ts` uses the browser's own JSON helpers (`parseRequestOptionsFromJSON`, `toJSON()`), with a small fallback for older browsers.
  - The server bounds the credential's shape and size with Zod; Supabase verifies it.
- **Assurance level (checked against the local server):** a passkey sign-in is **aal1** (`amr: passkey`), even when the person has an authenticator app. So the code is still asked for afterwards (D-028). Passkeys are therefore a convenient, phishing-resistant first step, not a second factor.
- **Kill switch:** `PASSKEYS_ENABLED=true` turns them on. It is read on the server at run time, not as a `NEXT_PUBLIC_` value baked into the build, so it can be switched off without rebuilding. With it off, the button and the Passkeys section disappear, and the actions refuse.
- **Relying party:** `rp_id = "localhost"` locally, with origins on ports 3000 (app), 3100 (e2e) and 3200 (Lighthouse). Passkeys don't work on `127.0.0.1`. Production needs the real domain in the Supabase dashboard (Authentication → Passkeys).
- **Turnstile:** the passkey button has its own Turnstile widget, because Supabase checks the captcha on `startAuthentication` when captcha is on.
- **Emails:** adding a passkey sends a "passkey added" alert. A stolen session could otherwise add a passkey quietly, to keep a way in.

## D-030 · Phase 2d · Devices, sessions and security emails

- **Devices:**
  - Supabase Auth only ever sees our server: every sign-in goes through it, so `auth.sessions.user_agent` is always `node`. The app therefore keeps its own record.
  - A random 256-bit device cookie (`aura_device`: httpOnly, SameSite=Lax, about 400 days) identifies a browser. Only its SHA-256 is stored, in `private.known_devices`, with a coarse label ("Chrome on Windows"). `private.session_devices` links each session to its device.
  - No IP addresses are stored or shown (D-016), and there's no fingerprinting.
  - The owner chose the cookie over a hashed browser-and-OS name, which would miss a new laptop with the same browser.
- **"New sign-in" email:**
  - Sent when an account signs in on a device it hasn't used before. Not for the account's first device: that's the sign-up itself.
  - It is checked after the first step (password, email link, Google or passkey), before two-step sign-in, so a password used by someone else is noticed even when the code stops them.
- **Sessions page** (Settings → Security):
  - `public.my_sessions()` and `public.revoke_my_session()` are security-definer functions over `auth.sessions`, limited to the caller's own rows. Each row shows the device, the last activity and "This device".
  - Actions: sign out one device, all others, or everywhere.
  - **Immediate sign-out:** `util.session_ok()` also checks that the token's session still exists. A device that is signed out stops working on its next request, instead of when its 10-minute access token expires (D-015). `requireAccount()` then clears its cookies and shows "You were signed out of this device".
- **Emails:**
  - **Supabase sends** "password changed", "two-step on" and "two-step off" (`[auth.email.notification.*]`, templates in `supabase/templates/`). They fire however the change was made, even straight through the Auth API.
  - **The app sends** "new sign-in", "recovery code used" and "passkey added", with React Email (`src/emails/`) through an `EmailSender` (`src/lib/email/sender.ts`):
    - **Resend** in production, through one `fetch` to its HTTP API (no SDK, as in D-013).
    - **Mailpit** locally and in tests.
    - **None** when unconfigured. `EMAIL_PROVIDER` overrides the choice; the local launcher sets `mailpit`, so local testing never emails anyone.
  - All are discreet: sender "Aura", neutral subjects, nothing about what the app is for (unit- and e2e-tested). They are sent in `after()` until Phase 7's job queue.
- **Before launch:**
  - Verify a sending domain in Resend and set `EMAIL_FROM`. Until then Resend only delivers to the account owner's own address.
  - Point Supabase's SMTP (dashboard → Authentication → SMTP) at Resend, so the Auth emails come from the same sender.
- **New packages:** `@react-email/components` and `@react-email/render` (server-only; approved 2026-10-06).
- **JavaScript budget:**
  - Settings → Security's client components live in a second entry point, `@/features/auth/ui-security`. ESLint now allows `@/features/<module>/ui-<page>` beside `ui`, so the sign-in pages don't download them and Security doesn't download the sign-in forms (extends D-023).
  - Gzip -9: `/settings/security` 158.7 KB, `/sign-in` and `/sign-up` 159.2 KB (the passkey button adds about 2 KB). Lighthouse's own measure: 170.3 and 170.8 KB. All Lighthouse categories score 96–100.

## D-031 · Phase 2d · Email without a domain: Gmail over SMTP

- **Context:** the owner is launching for 2–3 groups and doesn't want to buy a domain yet. Resend only delivers to the account owner's own address without a verified domain. Supabase's built-in mailer is for testing only.
- **Decision (owner, 2026-10-06):** until there is a domain, all email goes through **one dedicated Gmail account** over SMTP, with an app password:
  - The app's own emails use a new `smtp` provider in `src/lib/email/sender.ts` (`EMAIL_PROVIDER=smtp`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`).
  - Supabase's Auth emails use the same account through the dashboard's custom SMTP settings.
- **Why Gmail:**
  - Google signs the mail itself, so it reaches inboxes without DNS work.
  - Personal Gmail allows roughly 500 messages a day, which is far more than a few groups need.
  - Free services that verify a single @gmail.com sender (for example Brevo) send it from their own servers, which fails Gmail's own authentication checks and tends to land in spam.
- **How:**
  - `nodemailer` (new dependency, owner-approved), used only on the server.
  - Port 465 uses TLS from the start. Any other port requires STARTTLS (`requireTLS`), so mail is never sent in the clear.
  - The sender defaults to `Aura <SMTP_USER>`, because Gmail only sends as the signed-in account.
  - `npm run email:test -- you@example.com` checks the settings without starting the app.
  - Local development and tests still use Mailpit; the launcher keeps `EMAIL_PROVIDER=mailpit`.
- **Trade-offs:**
  - The Gmail address is visible as the sender, so its name must be neutral (discretion, §7.8).
  - Google may lock an account that suddenly sends a lot of automated mail.
  - The app password is a full credential for that mailbox: it lives only in the host's environment settings and in Supabase. Use the Gmail account for nothing else, so a leak exposes nothing else.
- **Later:** buy a domain, verify it in Resend, and set `EMAIL_PROVIDER=resend` (and Supabase SMTP to Resend). Nothing else changes.

## D-032 · Phase 2e · "Download my data": one zip with JSON and CSV

- **Decision (owner, 2026-10-06):** Settings → Your data → **Download my data** gives one file, `aura-data-YYYY-MM-DD.zip` (a neutral name, §2.3), with:
  - `data.json`: every section in one file;
  - `csv/<section>.csv`: one CSV per section (UTF-8 with a byte-order mark for Excel; cells starting with `= + - @` get a leading apostrophe so spreadsheets never run them as formulas);
  - `files/avatar.webp`: the current profile photo, if there is one;
  - `README.txt`: what everything is, in plain words.
- **Contents today:** account (email, sign-in methods, whether two-step sign-in is on), profile, privacy and notification settings, the "my why" (decrypted: it is the person's own), consent records, passkey names and dates, current devices, and the person's own security events (`public.my_audit_events()`: action, time, device label).
- **Never in it:** password hashes, two-step secrets, recovery codes (only their hashes exist), tokens, IPs (none are stored), anything about another person.
- **How:**
  - Each module exports its own part (`exportAuthData()`, `exportProfileData()`); the route `POST /api/account/export` combines them. **Phase 3 onwards add their part there** (groups, check-ins, journal…).
  - Reads go through RLS as the signed-in person, so the export can only contain what they may already see. `util.session_ok()` applies: no export before the two-step code is entered.
  - The zip is written by a small stored-only writer (`src/lib/zip.ts`, about 80 lines, unit-tested against Python's `zipfile` and `unzip -t` by hand), so there is no new dependency.
  - A plain form POST, so it needs no JavaScript. CSRF: Origin must name this host, and `Sec-Fetch-Site` must be same-origin when sent (the same check Server Actions make).
  - 3 exports an hour per person; `account.exported` in the audit log; `Cache-Control: private, no-store`.
- **Not done (owner chose to skip, 2026-10-06):** asking for a fresh sign-in before export or deletion. Two-step sign-in (when on) and the 14-day grace period are the protection. Revisit with the app lock (§7.10).

## D-033 · Phase 2e · Account deletion: 14 days of grace, then erasure

- **Decision (owner, 2026-10-06):**
  - **Asking:** Settings → Your data → Delete my account explains what happens, offers the download, and asks for one ticked box. `public.request_account_deletion()` sets `profiles.deletion_requested_at` (members can't write that column) and signs out every other device. A discreet email says when the account will close and how to keep it.
  - **During the 14 days:** the profile is hidden from everyone at once (`profile_cards`). `requireAccount()` sends the person to `/account-closing`, the only page they can open: **Keep my account** (`cancel_account_deletion()`, plus a "stays open" email, so a cancellation by someone else is noticed), **Download my data**, or **Sign out**. Asking twice keeps the first date.
  - **Erasure:** a daily `pg_cron` job (`account-deletion-daily`, `private.purge_due_accounts()`) runs inside the database, so it happens on time even when the app isn't running. For each due account it:
    1. calls `private.anonymise_group_contributions()` (empty until Phase 3, see below);
    2. queues the person's Storage folder;
    3. removes the person's id from their audit rows (they stay for their year, linked to nobody, as the privacy policy says);
    4. deletes the `auth.users` row, which cascades to every personal table and to Supabase's sessions, identities, factors and passkeys;
    5. writes an anonymous `account.deleted` event.
  - **Files:** deleting Storage rows in SQL would leave the files behind, so the app removes them through the Storage API: `GET /api/cron/account-purge` (Bearer `CRON_SECRET`; Vercel Cron calls it daily from `vercel.json`) runs the same job and empties `private.storage_purge_queue`. Locally: `npm run accounts:purge` while the app runs. Until there is hosting, queued photos can wait in the private bucket; nothing can serve them, because the profile is gone.
  - Backups roll over within 30 days (privacy policy).
- **Group contributions, for Phase 3 onwards to implement in `private.anonymise_group_contributions()`:**
  - posts and comments stay, with `author_id` set to null and shown as "A former member";
  - reactions, nudges, memberships, partnerships and invites the person created are deleted;
  - a group the person owns passes to its longest-serving admin, else its longest-serving member, else it is archived.
- **New settings:** `CRON_SECRET` (server-only, at least 32 characters). Without it the purge route returns 404; the database still erases accounts daily.
- **Data-model additions (approved 2026-10-06):** `profiles_deletion_requested_idx`; `private.storage_purge_queue`; `util.account_deletion_grace()` (14 days, equal to `ACCOUNT_DELETION_GRACE_DAYS`); the functions above, with service-role-only `run_account_purge()`, `claim_storage_purges()` and `complete_storage_purge()`. No new personal tables in `public`, so no new `session_ok()` policies; the new member functions check `util.session_ok()` themselves.
- **Emails** reuse the security-alert template ("accountClosing", "accountKept"): sender "Aura", neutral subjects, unit- and e2e-tested for sensitive words.

## D-034 · Phase 3 · Every group write goes through one database function

- **Context:** CLAUDE.md §5 lets writes go through server actions or Postgres functions, and the Phase 3 "done when" says an admin must not be able to act on another group "even by calling the API directly".
- **Decision (owner, 2026-10-07):**
  - `groups`, `group_members`, `group_invites`, `group_covenant_proposals` and `group_covenant_agreements` have **no insert, update or delete grants** for any API role. Reads go through RLS.
  - Every change is a `security definer` function (`create_group`, `update_group_details`, `set_group_member_role`, `join_group`, …). Each one checks `util.session_ok()`, locks the group row, reads the caller's own role **in that group**, makes the change and writes the audit row, all in one transaction. For a group the caller isn't an active member of, the answer is `group_not_found` (42501), the same as for a group that doesn't exist.
  - **Audit rows are written by the functions themselves** (`util.audit`), so a direct API call can't skip them. They hold ids and role or share-level values only. When an action concerns another member, that member is the `target_id` and the group id goes in the metadata, so erasing their account unlinks the row (D-033). These rows have no device label; app-side events (picture screening, too many wrong codes) still use `src/lib/server/audit.ts`.
  - Errors come back as short keys (`group_full`, `invite_expired`…), turned into copy by `src/features/groups/errors.ts`.
- **Helpers:** `util.group_status()`, `util.group_role()`, `util.is_active_member()`, `util.is_group_admin()`, `util.account_open()`, all including `session_ok()`. `util.shares_group()` now really answers (D-022): two active members of one group, plus a group's admins seeing the cards of people asking to join or removed.
- **RLS:** a group row is readable by its active members and by people with a pending request; members see the group's active members (accounts closing for deletion are hidden, D-033); admins also see requests and removals; only admins see invites, and the hash columns are granted to nobody. Every table has the RESTRICTIVE `session_ok()` policy (D-028).
- **Tests:** pgTAP `020`–`024`. `022_groups_isolation` finds every table in `public` with a `group_id` column by itself, so tables from later phases are checked automatically, and fails if a new function taking a group, proposal or invite id isn't in its list. `023_platform_session_gate` fails if any RLS table lacks the `session_ok()` policy. `tests/e2e/group-isolation.spec.ts` tries every page, the picture route and every function against another group.

## D-035 · Phase 3 · Group URLs use the id, and tab titles never show a group's name

- **Decision:** `/groups/<uuid>`, not the slug. A group's name could say what the app is for ("No Fap brothers"), and URLs end up in browser history, autocomplete and screenshots. Tab titles say "Group", "Members", "Invites" (§2.3). `slug` is still generated (unique, from the name plus 10 random hex characters) and kept for later.

## D-036 · Phase 3 · Group pictures: the avatar pipeline, for owners and admins

- **Decision (owner, 2026-10-07):** owners **and admins** can change a group's name, description and picture; the challenge settings, the covenant, hand-over, archive and delete stay with the owner (§3).
- The picture is a square, like a profile photo, and uses the same pipeline (D-026): on-device crop, server re-encode to three WebP sizes with no metadata, Google Cloud Vision screening before anyone sees it, private `group-pictures` bucket written only by the server, served by `/api/group-picture/<id>` after an RLS check (members and people asking to join). `groups.cover_path` holds it (the spec's column name), with `cover_pending_path` and `cover_status`.
- The server checks the role before storing files, and `set_group_picture_pending()` checks it again as the person; the files are removed if it refuses.
- The shared code moved: `src/lib/images/` (processing, screening, crop maths) and `src/components/image-picker/` (the picker and cropper, which take their copy from `profile.avatar` or `groups.picture`). Group pictures are drawn as rounded squares so a group never looks like a person.
- A deleted group's picture folder is queued in `private.storage_purge_queue` (now allowing the `group-pictures` bucket) and removed through the Storage API by the daily purge (D-033).

## D-037 · Phase 3 · Invites: link, short code and a themed QR code

- **Link and QR:** a 160-bit random token, `/join/<token>`, stored as SHA-256. The route keeps the invite in an httpOnly cookie (`aura_invite`, an hour, the hash only) and redirects to a clean `/join`, so the token doesn't stay in the address bar or history, and the invite survives sign-up and onboarding (the last onboarding step offers "Join <group>").
- **Short code:** 10 Crockford base32 characters (50 bits), shown as `ABCDE-FGHJK`, stored as HMAC-SHA256 with a key derived from `APP_ENCRYPTION_KEY` (like recovery codes, D-028). 50 bits is weaker than the link, so codes are typed only by signed-in, email-verified people and limited to 5 wrong codes per person and 20 per network in 15 minutes (`group.invite_code_rate_limited` is audited).
- Admins see the link and code **once**, right after making the invite; only the hashes are stored. "Replace with a new one" stops an invite and makes a fresh one with the same settings.
- Invites last 1, 3, 7 (default), 14 or 30 days, with an optional use limit (1–500); at most 20 working invites per group. `use_count` is taken under a row lock, so the last use can't be spent twice.
- **The invite page** (`/join`, `noindex`, `referrer: no-referrer`) shows a signed-out visitor only the group's name and member count. Signed in, it shows the description, the challenge, the covenant and its accountability level, and the share-level choice (D-027) before an unticked "I accept". `join_group()` refuses if the covenant changed since the page was read.
- **Refusals** are friendly and specific: expired, stopped, used up, full, archived, unknown, already a member, already asked, removed.
- **`join_policy`:** groups are never discoverable, so both policies need an invite. `invite_only` joins at once; `request_to_join` turns the invite into a request an owner or admin approves. Pending requests are capped at the member cap.
- **QR codes in the app's look (owner, 2026-10-07):** drawn on the server as an SVG by `src/features/groups/qr.ts` with the `qrcode` package (new dependency, server-only, 0 KB in the browser): error correction H, indigo dot "pills" on a warm dawn-white card with a gold frame, rounded indigo corner eyes, and the sunrise mark in the centre. Every colour a scanner reads is dark indigo on near-white. Checked by decoding the rendered PNG at 180, 300 and 600 px with jsQR (by hand, not in CI, to avoid a test-only dependency); about 6 KB per code. Admins can copy the link and code, share the link (Web Share), and download the QR code as an SVG.

## D-038 · Phase 3 · Leaving deletes the membership; removals stay

- **Decision (owner, 2026-10-07):** leaving a group (or withdrawing a request) deletes the `group_members` row: membership is sensitive data (§11) and nothing needs it afterwards. So `status` never holds `left`; the check allows `active`, `pending` and `removed`.
- A **removed** member keeps a `removed` row, so they can't come back with an old link. An owner or admin can "Allow back" (the row is deleted; they then need a fresh invite).
- The owner can't leave: they hand the group to another member first (they become an admin), or archive or delete it.
- Owners promote and demote; owners remove anyone else; admins remove members (not other admins); nobody removes the owner.

## D-039 · Phase 3 · Tightening the covenant needs every member's agreement

- **Context:** D-027 put the accountability level in the covenant that people agree to before joining. Changing it later would change what they agreed to.
- **Decision (owner, 2026-10-07):**
  - **Relaxing** applies at once: a lower minimum share level, or allowing leaderboard hiding.
  - **Tightening** — a higher minimum, no more hiding, or new covenant words — applies at once only while nobody else has joined. Otherwise it becomes a **proposal** (`group_covenant_proposals`) that every other active member must agree to (`group_covenant_agreements`). Any member may decline, which closes it; the owner may withdraw it; it lapses after 14 days. One open proposal per group.
  - When the last agreement arrives (or the last member who hadn't agreed leaves or is removed, or their account is erased), the new covenant applies: members below the new minimum are raised to it, hiding is switched off if it's no longer allowed, and requests to join made under the old covenant are declined (they didn't agree to it).
  - The group home shows the open proposal side by side with the current covenant, with "I agree" / "I don't agree".
- **Data-model additions:** the two tables above, and `groups.covenant_updated_at`.

## D-040 · Phase 3 · What erasing an account does to groups

- Fills in `private.anonymise_group_contributions()` (D-033):
  - each group the person owns passes to its longest-serving **admin**, else its longest-serving member (accounts that aren't closing first). A group with **nobody else in it is deleted**, not archived, since nobody could ever see it again (owner's choice, a small change to D-033); its picture folder is queued for removal;
  - their memberships, requests, covenant agreements and the invites they made are deleted, and open covenant changes are re-checked (they may have been the last one who hadn't agreed);
  - hand-overs are audited with no actor.
- Posts, comments and reactions (Phase 5) and nudges and partnerships (Phase 6) don't exist yet. The function marks where those phases add their part: posts and comments stay with `author_id` null ("A former member"); reactions, nudges and partnerships are deleted.
- Accounts closing for deletion disappear from member lists at once (RLS) and from profile cards (D-033). They still hold their seat until erased.

## D-041 · Phase 3 · Groups data-model additions, limits and the data export

- **`groups`:** `challenge_days` (the length; `end_date` = `start_date` + days − 1, null for ongoing; a check keeps them consistent), `member_count` (active members, kept by a trigger, §14), `cover_pending_path`, `cover_status`, `covenant_updated_at`, `created_at`, `updated_at`. `owner_id` is `on delete restrict`, so an erased owner's groups must be handed on first. Custom challenges are 7–365 days; the start date is from a month ago to a year ahead, in the group's time zone; caps are 2–500 members (default 50).
- **`group_members`:** `leaderboard_hidden`, `invite_id`, `covenant_accepted_at`, `requested_at`, `updated_at`; exactly one owner per group (unique index); a trigger keeps `share_level` at or above the group's minimum and refuses hiding where it isn't allowed.
- **`group_invites`:** `code_hash`, `created_at`.
- **Limits against abuse:** a person may own 10 unarchived groups and belong to (or have asked to join) 30. Rate limits: starting groups 5 a day; invites 20 an hour; joins 10 an hour per person and 30 per network; other group actions 120 an hour; group pictures 10 an hour; invite links and the join page 60 a minute per network.
- **"Download my data"** gains `group_memberships`, `groups_owned` (with the covenant), `group_invites_made` (dates and counts; the links and codes were never kept), `covenant_agreements`, and the pictures of groups the person owns. Nothing about other members.
- **Not yet:** unread counts in the switcher (Phase 7), the group's check-ins, leaderboard, wall and totals (Phases 4–5), the celebration and "start a new round" when a challenge completes (Phase 5).
- **JavaScript budget (gzip -9, first load):** `/groups`, the group home and members 156.0 KB; `/join` 154.2 KB; `/groups/new` 159.7 KB; invites 159.9 KB; settings 160.8 KB. The invites page has its own client entry point (`@/features/groups/ui-invites`) and settings keeps `ui-manage`, so neither downloads the other's forms (D-023, D-030). The group switcher is server-rendered `<details>`, with no client JavaScript.
- **The wizard without a jump:** without JavaScript every step shows and the form still works. With scripting on, CSS shows only step 1 until the wizard takes over (`@media (scripting: enabled)`), so the first paint already matches and nothing shifts (CLS 0).
- **A mistyped invite code stays in the box** after a refusal, so a typo can be fixed in place (§9: never ask for the same information twice).

## D-042 · Phase 4 · Check-ins are written only through database functions

- **Decision (owner approved the plan, 2026-10-08):** `checkins`, `user_stats` and `group_member_stats` have no insert, update or delete grants for API roles (as in D-034). Reads are owner-only through RLS, and every table has the RESTRICTIVE `session_ok()` policy.
- `public.submit_checkin()` and `public.save_checkin_reflection()` check `util.session_ok()`, refuse accounts closing for deletion, check the window and every field, save, replay the person's stats, refresh their group stats, and audit an edit, all in one transaction.
- **The window lives in the database:** `util.checkin_dates(tz, now)` is today in the person's own zone, plus yesterday until 12:00 local time. There is no other backfilling. A direct API call can't get around it.
- **Testable time:** every clock-dependent function takes `p_now` (the public wrappers pass `now()`), so pgTAP pins instants: midnight in India (18:30 UTC) and Nepal (+5:45), the same instant being different days in India and New York, noon on both sides, and both 2026 daylight-saving changes in New York.
- **Edits are audited** as `checkin.edited` with the check-in's id and no content. First answers aren't audited.
- Errors are short keys (`checkin_window_closed`, `checkin_invalid`…) turned into copy by `src/features/checkins/errors.ts`; only known keys are accepted from `?error=`.

## D-043 · Phase 4 · Streaks are replayed, and read "live"

- Stats are recalculated by replaying all of a person's check-ins (gaps and islands) on every save. An edit inside the window (clean to slipped, or back) is therefore always right, and Phase 5's level engine can use the same approach. This is cheap: even ten years of check-ins is about 3,650 rows.
- `user_stats.current_streak` and `checkin_streak` are the runs ending at the last check-in, which go stale overnight. Reads go through `util.live_count()`. A run is alive while its next day can still be answered: its last day is today or yesterday, or the day before yesterday while it is still before 12:00. Otherwise it reads 0. So no nightly job is needed.
- **A missed day is never a slip:** it ends the run and is shown as "No check-in". A slip resets only the current streak; longest streak, total clean days and the check-in streak stay. pgTAP `031` covers all of this.

## D-044 · Phase 4 · What a group sees: `group_checkins_today`, and encrypted notes

- **The view:** a security-definer view with `security_barrier`. It returns rows only for groups the viewer is an active member of, and only for active members whose accounts aren't closing. Columns are cut by the member's share level **in that group**:

  | Share level          | What the group sees             |
  | -------------------- | ------------------------------- |
  | checkin_only         | checked in today: yes / no      |
  | streak               | + the live current streak       |
  | full                 | + today's answer                |
  | an active partner    | + mood, urge level and triggers |
  | you, on your own row | everything                      |

- **Partners:** `util.are_partners()` is still false until Phase 6; pgTAP `032` stands in a partnership inside its rolled-back transaction, so that path is already tested.
- **"Today"** is each member's own today.
- **No outcome is ever exposed at checkin_only,** neither directly nor through filters (`032`, and the e2e test reads the view through the API). The 022 isolation meta-test picks the view up automatically.
- **Notes:** encrypted by `encryption.ts` (AES-256-GCM) with `checkin-note:<user id>:<date>` as associated data, so a note can't be moved to another person or day. The database refuses anything not in the `v1:` format, even from the table owner. Only the author can read a note, decrypted in their own pages and their data export.
- **Not shown yet:** the group's "Together" total. In a small group, a sum of clean days could reveal a checkin_only member's slip (a check-in that adds nothing). Phase 5 decides that rule alongside the leaderboard.

## D-045 · Phase 4 · Challenge stats per group, recalculated in the transaction for now

- `group_member_stats` counts a member's clean days and check-ins from the later of the challenge's start and the day they joined (their own time zone), up to the challenge's end. Rows come and go with active membership (a trigger and a foreign key). Moving the challenge's dates recalculates the group.
- The table is **owner-only**: the counts could reveal a slip. Groups will see them only through Phase 5's share-level leaderboards.
- **Departure from §5 ("stats updates go through a job queue"), owner approved:** there is no queue until Phase 5. A save recalculates the person's own stats and their rows in at most 30 groups inside the same transaction, which takes a few milliseconds. Phase 5 moves group stats to the pgmq job with XP and leaderboards.

## D-046 · Phase 4 · The slip page, and "look at everything you kept"

- After "I slipped", the check-in lands on `/check-in/done` (tab title "Check in"; until privacy review 1 it was `/check-in/new-mercies`, D-055), which shows:
  1. A grace message and 1 John 1:9 (WEB).
  2. **The owner's request:** "Your streak may have reset today, but look at everything you kept", listing total clean days, the number of streaks built and the longest streak.
  3. An optional private reflection: triggers plus a note, saved encrypted as that day's note, so there is no second encrypted column.
  4. A card about not carrying it alone. Asking a partner or the group to pray needs Phase 6, so the card links to your groups for now.
  5. One suggested next step, rotated by date (breathe with SOS, a walk, Psalm 51, a message to a friend).
- **The same "kept" message** shows on Home and Progress whenever the current streak is 0 and there are clean days to look back on ("Your streak paused…" after a missed day).
- **Data model:** `user_stats.clean_streaks` (how many separate clean streaks), plus `total_checkins`, `last_clean_date` and `updated_at`. Phase 5 adds `xp`, `level`, `level_progress_days` and `highest_level` with the level engine.
- **No red, no failure words:** slips use the soft `--color-slip` lavender and a sunrise icon. A unit test scans all check-in copy for failure words ("fail", "relapse", "shame", "lost", …).

## D-047 · Phase 4 · Time-zone changes

- "Today" comes from the profile's current zone. Changing zone could open at most one extra day (for example, jumping from UTC+14 to UTC−12). The owner accepted this rather than adding a lockout.
- Every change is now audited (`profile.timezone_changed`), without the zone itself, which hints at where someone lives.
- Each check-in stores the zone it was answered in.

## D-048 · Phase 4 · `/join` inside the app shell; "needs your answer"

- **`/join`:** moved to a `(join)` route group whose layout picks the frame by session:
  - **The app shell** (sidebar, bottom navigation, group switcher) for signed-in, onboarded people with a live session.
  - **The sign-in frame** for everyone else, including people still in onboarding or closing their account.
  - The two frames are shared components (`src/app/[locale]/_frames/`), also used by the `(app)` and `(auth)` layouts.
  - Unchanged: `noindex`, `referrer: no-referrer`, the held-invite cookie and the onboarding hand-off.
  - e2e checks the nav on `/join` when signed in and its absence when signed out, with axe and 320 px reflow.
- **"Needs your answer":** `getMyGroups()` marks groups where an open covenant change is waiting for my agreement (D-039). `/groups` shows "A covenant change needs your answer"; the switcher shows a dot (with screen-reader text) and a label next to the group. Phase 7 adds real notifications.

## D-049 · Phase 4 · Pages, charts, export and limits

- **Pages:**
  - `/check-in`: today, or yesterday via `?date=` while open. Once answered, it shows the answer with "Change your answer".
  - `/check-in/done`: a thank-you, the streak ring and a verse; after a slip, the slip page (one address for both answers since D-055).
  - `/progress`, "Your journey": streaks, the month calendar (two years back), mood and urge charts over 30 or 90 days, triggers and insights.
  - `/home`: shows today's status and streaks.
  - The group home's "Today" panel replaces its placeholder. Progress is linked from Home, Check in and Me; the bottom navigation stays at the spec's five items.
- **Forms are plain HTML posting to Server Actions,** so check-ins work without JavaScript. The only client code is the two answer buttons (`@/features/checkins/ui`), which hold both buttons while saving and show "Saving…", with labels passed as props, so no message namespace ships for them.
- **Charts:** server-rendered SVG, no library and no JavaScript. Mood and urges are two small charts rather than one chart with two measures. They have 2 px lines, 8 px markers with native tooltips, a missed day breaks the line, and a table holds the same numbers. Trigger bars are SVG `width` attributes, since the CSP allows no inline styles (D-007).
- **Insights:** pure, unit-tested functions on the person's own data (`src/features/checkins/insights.ts`), for example free days out of days checked in, triggers that come up most, weekday or weekend urges, one weekday that stands out, mood lifting or dipping, low moods with strong urges, and what came up on harder days.
- **"Download my data"** gains `checkins` (notes decrypted for the person), `day_counts` and `group_challenge_counts`.
- **Rate limit:** `checkinSaveByUser`, 30 an hour (answers, changes and reflections).
- **SQL lint fixed:** CI's "Lint SQL" step had been failing since Phase 3. Seven group functions declared an unused `g` variable. Migration `20261009000400_groups_lint_unused_variables.sql` recreates them without it; their behaviour is unchanged.

## D-050 · Security review 1 · Two-step sign-in counts only when the app checked the code (SR-1, high)

- **Finding:** Supabase Auth's public `/auth/v1/factors/:id/verify` endpoint upgrades a session to aal2 on the right code. Someone holding only the password could call it directly with the publishable key and skip the app's limit of 5 wrong codes per 15 minutes. Verified locally: 40 wrong codes in a row, no refusal, then the right one gave aal2 tokens. Hosted Supabase allows 15 challenge/verify requests a minute per IP address (not tunable), so a few addresses find a 6-digit code within a day. The hook that could limit attempts per factor (MFA verification attempt) needs the Team plan.
- **Fix:** `private.mfa_verified_sessions` records sessions whose code the app itself checked. `public.mark_session_mfa_verified(user, session)` (secret key only; refuses sessions that aren't the person's or aren't aal2) is called right after the app's rate-limited `challengeAndVerify` in `/sign-in/verify` and in authenticator setup. `util.mfa_passed()` = aal2 **and** that mark; `util.session_ok()`, `auth_gate()` and `replace_recovery_codes()` use it. A session upgraded behind the app's back reads nothing and `auth_gate()` reports the code step as pending, so the person lands on `/sign-in/verify`, where the 5-tries limit applies.
- **Migration:** `20261010000100_auth_mfa_session_marker.sql`. Sessions already at aal2 are marked when it runs, so nobody is signed out. Marks for ended sessions go in the hourly clean-up.
- **Tests:** pgTAP `016_auth_mfa_session_marker` (14 checks); `014`, `015` and `023` now record the mark where a test session passes the code step.

## D-051 · Security review 1 · Rate limits inside the database (SR-2, medium)

- **Finding:** the app's limits run in server actions, but any signed-in person can call the write functions straight through the Data API with their own token. Verified: 100 `submit_checkin` calls and 200 `update_my_group_membership` calls all succeeded, writing 299 audit rows (the app allows 30 and 120 an hour). Phase 6's posts, reactions and nudges would inherit the gap.
- **Fix:** `private.throttle(user, bucket, limit, window)` keeps a fixed-window count per person and bucket in `private.rate_limit_counters` and refuses the call over the limit with SQLSTATE `PT429` (HTTP 429 from PostgREST), message `rate_limited`. Limits sit a little above the app's, so the app's friendlier message always comes first:

  | Bucket         | Where                                                             | Database    | App |
  | -------------- | ----------------------------------------------------------------- | ----------- | --- |
  | `checkin_save` | `submit_checkin`, `save_checkin_reflection`                       | 40 an hour  | 30  |
  | `group_manage` | every function through `private.lock_group()`, plus `leave_group` | 150 an hour | 120 |
  | `group_create` | `create_group`                                                    | 8 a day     | 5   |
  | `group_join`   | `join_group`                                                      | 20 an hour  | 10  |

- Only calls that succeed count: a refused or failing call rolls back with its count. The app maps `rate_limited` to its existing "rateLimited" copy.
- **Phase 6 must** call `private.throttle()` in the post, comment, reaction and nudge functions.
- **Tests:** pgTAP `025_platform_db_rate_limits` (10 checks).

## D-052 · Security review 1 · Which header names the visitor (SR-3, medium)

- **Finding:** `clientIp()` used the **first** `X-Forwarded-For` entry, which is whatever the client sent whenever a proxy appends rather than replaces (Cloudflare appends). Anyone could pick a new "address" per request and get fresh per-network limits (sign-in, sign-up, emails, invite codes). And with Cloudflare in front of Vercel, the address Vercel sees is Cloudflare's, so every visitor behind one Cloudflare data centre would share one limit.
- **Fix:** `TRUSTED_IP_HEADER` names the one header the platform writes: unset means `X-Forwarded-For`, using its **last** entry (the one the nearest proxy added; on Vercel, the only entry); `cf-connecting-ip` behind Cloudflare's proxy. Other headers are ignored; with nothing usable, requests share the key `unknown`.
- **Tests:** `src/lib/security/request-info.test.ts`.

## D-053 · Security review 1 · Count the try before checking it (SR-4, low)

- **Finding:** "5 wrong passwords per address" and "5 wrong invite codes per person" peeked at the count, did the slow check, then counted the failure. Twenty requests sent together all peeked at zero, so all twenty were tried.
- **Fix:** `consume()` first; a new `refund()` gives the try back when it turns out right (an invite code that works, or a sign-in refused for a reason other than a wrong password). A successful sign-in still clears the count.
- **Tests:** `src/test/rate-limit-races.test.ts`.

## D-054 · Security review 1 · Full-length GCM tags only (SR-5, low)

- **Finding:** Node accepts AES-GCM tags as short as 4 bytes unless told the length, and `decryptText()` didn't say. A truncated tag makes forging a value far cheaper.
- **Fix:** encryption and decryption pass `authTagLength: 16`, and a tag of any other length is refused before decrypting.
- **Tests:** `src/lib/security/encryption.test.ts`.

## D-055 · Privacy review 1 · Nothing outside the app's content gives the topic away (PR-2, PR-3, PR-7)

- **One address after a check-in.** Both answers redirect to `/check-in/done?date=…`; the page shows the slip page or the thank-you from the saved check-in, never from the URL. `/check-in/new-mercies` is gone, because browser history and the host's request logs showed which days were slips.
- **"Aura" in the app's own chrome.** The app shell, sign-in frame, onboarding header, error and 404 pages show the short name, like tabs, emails and (Phase 9) the home screen. "Holy Auramaxxxing" stays on the public landing page and the legal pages. When unsure, the more private option (§15).
- **Group names:** the hint now says the name shows at the top of members' screens, so a plain name keeps things discreet.
- **A standing test,** `src/test/discretion.test.ts`, scans the short name, page description, every tab title, the last-resort error page, every app email, Supabase Auth's subjects and templates, the sender name, the export file name and README, and the invite share text for topic words (and "auramaxx"/"xxx"). It also fails if a URL segment names the topic or an answer, or if the check-in redirect depends on the answer. Phases 5–9 add their share cards, notifications and manifest to it.

## D-056 · Privacy review 1 · Keep nothing from Google but the email (PR-1, high)

- Google sign-in wrote the person's real name and Google photo into `auth.users.raw_user_meta_data` and `auth.identities.identity_data` at every sign-in. `user_metadata` goes into every access token, so the name rode in each request's cookie, and the export didn't include it.
- BEFORE INSERT/UPDATE triggers (`on_auth_user_strip_profile`, `on_auth_identity_strip_profile` → `private.strip_provider_profile()`) keep only `sub`, `iss`, `email`, `email_verified`, `phone_verified` and `provider_id`. The key list is written out in the triggers rather than in a helper function, because they run as Supabase Auth's role, which can't see our schemas. The sign-up ticket is still read first: BEFORE triggers fire in name order and `on_auth_user_before_insert` sorts before `on_auth_user_strip_profile`.
- Migration `20261011000100_platform_privacy_minimisation.sql` also cleans existing rows. pgTAP `040_platform_privacy`.

## D-057 · Privacy review 1 · Supabase Auth's own records and stale counters (PR-4, PR-5)

- Supabase Auth stores IP addresses (`auth.audit_log_entries`, `auth.sessions`, `auth.mfa_challenges`), full User-Agent strings (`auth.sessions`) and finished OAuth flows that can hold provider tokens (`auth.flow_state`). Our Privacy Policy says we keep no IP addresses, and our sessions page and `audit_log` use a coarse device label instead.
- `private.hourly_auth_maintenance()` now: blanks `auth.sessions.ip` and `user_agent` (nobody is signed out); keeps one day of `auth.audit_log_entries` and blanks their IPs; deletes `auth.mfa_challenges` and `auth.flow_state` rows older than an hour; and deletes `private.rate_limit_counters` rows whose window started more than a day ago (the longest window), which were a permanent "last active" record.
- So an IP address lives at most about an hour, only in Supabase Auth's tables. The policy now says so.
- pgTAP `040_platform_privacy`.

## D-058 · Privacy review 1 · The Privacy Policy and export page say what we actually hold (PR-6)

- Processors now include Google Cloud Vision (it receives only the picture being checked) and Google, only for people who sign in with Google. The policy says we keep only the email from Google, lists profile content, and describes the device name kept with security records.
- The export page lists check-ins and their private notes.
- `POLICY_VERSION` is now `2026-10-08-draft` and the legal pages say "Last updated 8 October 2026". Accounts made earlier keep their `2026-10-05-draft` consent records. The policy is still a draft awaiting legal review, so the planned re-consent flow (Phase 11) is not needed yet.

## D-059 · The app's name is "Holy Auramaxing" everywhere people see it; email from holyauramaxing@gmail.com

- **Owner's decision (2026-10-08):** "Aura" (the short name from D-030 and D-055) and "Holy Auramaxxxing" are both replaced by **"Holy Auramaxing"** in everything people see: tab titles, the app's header, the landing and legal pages, every email subject, body and sender name, Supabase Auth's templates and subjects, the invite share text, the authenticator-app label (TOTP issuer), the passkey prompt (`rp_display_name`) and the data export (`holy-auramaxing-data-<date>.zip`, `"format": "holy-auramaxing-data-export"`).
- **Kept as they are (nobody sees them):** the repo and folder names, `package.json`'s name, the Supabase `project_id`, and the cookie names `aura_device` and `aura_invite`. Renaming `aura_device` would make every browser look new and send everyone a "New sign-in" email.
- Authenticator apps that were set up earlier keep showing "Aura" until two-step sign-in is set up again. Existing passkeys keep working, because the relying party ID is unchanged.
- **Handles:** `auramaxing`, `holy_auramaxing` and `holyauramaxing` are reserved (migration `20261012000100_profile_reserved_handles_rename.sql`).
- **Discretion:** the name says the app is Christian but not what it is for. `src/test/discretion.test.ts` now forbids "xxx" rather than the name, and checks that the name has one spelling everywhere.
- **Email:** the dedicated Gmail account is now `holyauramaxing@gmail.com`, replacing `holyauramaxxxing@gmail.com`. `SMTP_USER` and `SMTP_PASSWORD` (the new account's own app password) change in `.env.local`, the host and Supabase's custom SMTP.

## D-060 · Accessibility review 1 · No toast closes on a timer (A-3, replaces D-012)

- WCAG 2.2.1 and CLAUDE.md §9 ("No time limits"). Pausing on hover or focus doesn't help screen-reader and keyboard users, who rarely do either.
- Every toast stays until it is dismissed. Only the newest three are kept, so they can't pile up. Errors are still announced assertively, and the others politely.
- Phase 7 should still keep everything important in the notification centre too.

## D-061 · Accessibility review 1 · On short screens the top bar scrolls away (A-8)

- At 200% zoom a laptop window is about 640 × 430 CSS px. The sticky top bar (57 px), the bottom navigation (69 px) and the floating SOS button left little room for the page.
- When the viewport is 30 rem (480 px) tall or less, `.shell-topbar` is no longer sticky. The bottom navigation and the SOS button stay, so navigation and help keep the same place (3.2.3, 3.2.6).
- The group switcher's menu is positioned against the top bar on phones (A-1), so it still opens below the bar when the bar scrolls.

## D-062 · Accessibility review 1 · Group slugs never end in a hyphen (side find)

- `private.make_group_slug` trimmed hyphens before cutting to 40 characters, so names with a space or punctuation at character 40 made slugs like `…narrow--e2c8…`. The slug check refused them, and creating the group failed.
- Migration `20261013000100_groups_slug_trailing_hyphen.sql` trims again after the cut. Existing slugs were all valid already (the check guarantees it). pgTAP `026_groups_slug`.

## D-063 · Grace review 1 · A missed day costs the same as a slip; offline check-ins; streak leaderboards stay

- **Context:** grace review 1 (`docs/grace-review-1.md`, G-1) found that a reported slip cost 10 levels while a missed day cost none, so skipping the check-in was safer than telling the truth (§2.2). It also suggested softening the streak leaderboards (G-2).
- **Decision (owner, 2026-10-10):**
  - **Every missed day costs 10 levels**, exactly like a slip (`RELAPSE_LEVEL_PENALTY`), never below 0, and empties the progress bar. It counts per day once that day's window has closed (yesterday at 12:00 local time); a week without check-ins costs 70 levels. Days before the account existed never count. A missed day is still shown as "No check-in", never as a slip.
  - **Offline check-ins:** a check-in made without internet keeps its local date and time on the device, syncs automatically, and counts for the day it was made even after the window has closed; the replay then removes that day's penalty. The server accepts it only within `OFFLINE_SYNC_MAX_DAYS` (owner to confirm; suggested 7), for a day inside its recorded window and not before the account existed, and logs `checkin.synced_late`.
  - **The Current streak and Clean days leaderboards and group goals stay.** The app is built "not to hide but to be free through accountability". G-2 is closed.
- **Consequences:** Phase 5 updates `data/build_levels.py` (`replay`) first, then makes the Postgres level engine match it, and reads the level "live" (like D-043) so missed days count even when the person never opens the app. The server path for late offline check-ins is built in Phase 5; the device queue in Phase 10. The device clock can be changed, so the sync limit is the guard against backfilling (threat model). CLAUDE.md §2.2, §7.5, §7.6, §13 and PROMPTS.md Phases 5 and 10 are updated.
- **Open:** the `OFFLINE_SYNC_MAX_DAYS` value, and whether days while an account is closing count as missed (suggested: no).
