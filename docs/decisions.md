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
