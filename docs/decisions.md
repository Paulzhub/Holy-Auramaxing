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
- **Closed in Phase 5b (D-070):** group stats are now recalculated by the queue's worker, a few seconds after the save.

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
- **Settled (owner, 2026-10-10):** `OFFLINE_SYNC_MAX_DAYS` is 7; days while an account is closing don't count as missed (D-066). Grace review wording: G-3 to G-9, G-11, G-12, G-14, G-15 and S-1 applied in Phase 5a (D-068); G-10 waits for Phase 6 and G-13 for Phase 7.

## D-064 · Phase 5a · The level engine: replayed, stored as of the last check-in, read live

- **Decision (owner approved the plan, 2026-10-10):** `private.recompute_level(user, now)` replays every day from the day the account started (its local date in the person's time zone; earlier if they answered "yesterday" on their sign-up day) to the last check-in, exactly like `data/build_levels.py` `replay`: +1 progress per free day (5 a level up to Level 20, then 10); a slip **or a missed day** drops `relapse_level_penalty` (10) levels, never below 0, and empties the bar; a paused day costs nothing (D-066). It runs inside every save (`private.after_checkin_saved`, next to the streak replay), so an edit or a late offline check-in recalculates.
- **Stored:** `user_stats.level`, `level_progress_days`, `highest_level` as of the last check-in. **Read live** through `private.live_level()`: minus 10 for each day after the last check-in whose window has closed (and wasn't paused), progress 0 if any. No nightly job, like the live streaks (D-043).
- **Yesterday still open:** if today is answered before yesterday, the replay also stores the result with yesterday not yet missed (`level_open*`, valid until `level_open_until`, yesterday's 12:00). Reads use it until noon.
- **The check-in page** compares with `level_before_save` (the live level just before the save) to show a level-up, a new era, or one quiet line after a drop.
- **Tunable values** live in `private.app_config` (`relapse_level_penalty` 10, `offline_sync_max_days` 7), read by `util.config_int()`. They are enforced by the database, so they are not environment keys; change them with a migration.
- **Parity:** pgTAP `050` replays 24 random histories (generated with the reference replay) and checks all 1,003 labels and day counts against `data/levels.csv`; `src/features/gamification/levels.test.ts` checks the TypeScript mirror and that `050` still embeds `levels.csv`.

## D-065 · Phase 5a · Level names, verses and the level card

- `public.level_tiers` (tiers 0–167) is seeded from `data/levels.json` plus `data/level_verses.json`: the World English Bible text of each tier's verse, taken from the `world-english-bible` npm package 1.0.1 (ebible.org's text) and spot-checked against ebible.org and the verses grace review 1 checked. A quotation mark opened before or closed after the verse is left off.
- `util.level_info()` / `util.level_label()`: past Level 1002 the last name continues with a number ("Well Done 2", "Well Done 2 Lite"…).
- **Level card** (Home, Progress): name, "Level 5 · Genesis", "0 of 5 days to …" (a progress ring), the verse. **After a check-in:** a level-up or a new era gets a small CSS-only light (transform and opacity, once; none under reduced motion or forced colours, so canvas-confetti isn't needed); a drop gets one quiet line: "You're now Clay. Your longest streak and total free days are still yours." The same line shows on Home while missed days have lowered the level. Nobody else is told.
- **Share card** (`/api/share/level`, a PNG from `next/og`, private and never cached): the level's name, era, verse reference and the app's name, no verse text (a few name the struggle) and nothing about days. Levels whose name gives the topic away (for now only "Temptation Dodger", levels 61–66, which contains "temptation") get no share card (since 5b, Level 0 has one too: D-073); the list of giveaway words is shared with `discretion.test.ts` (`src/lib/discretion.ts`).
- **Groups:** `group_checkins_today.level` and `profile_cards.level` show the live level only where the member shares their streak or more (`util.can_see_level`: a group the viewer shares where the owner is at streak or full). pgTAP `050`, e2e `levels.spec.ts`.

## D-066 · Phase 5a · Days while an account is closing are paused

- **Owner (2026-10-10):** a day doesn't count as missed if its window closed while the account was closing for deletion (check-ins are refused then).
- `private.account_pauses` records each closing period (a trigger on `profiles.deletion_requested_at`). Cancelling ends the pause and replays the level, so someone who keeps their account loses nothing for those days. pgTAP `050`.

## D-067 · Phase 5a · Late offline check-ins (server side)

- `public.submit_offline_checkin(date, recorded_at, …)` and the route `POST /api/checkins/sync` (JSON, same-origin only, signed in, `checkinSaveByUser`). The note is encrypted in the app like any check-in.
- Accepted only if: the day was inside its window at `recorded_at` (the device's record, in the person's time zone); `recorded_at` isn't more than 5 minutes in the future or before the account existed; it arrives within 7 days (`offline_sync_max_days`); and the day has no answer. While the day is still open it is an ordinary save (or edit). Accepted late ones are audited as `checkin.synced_late` with the check-in id and the date only.
- Answers: `{ status }`, or `{ error, drop }`; `drop: true` (too old, already answered, outside its window, invalid) tells the Phase 10 queue to forget it.
- **Risk accepted:** the device clock can be changed, so someone can backfill up to 7 days. Threat model updated. pgTAP `051`, e2e `levels.spec.ts`.

## D-068 · Phase 5a · Grace review 1 wording

- Applied (owner, 2026-10-10): "free days" for "clean days" in what people read (G-3); "His mercies are new every morning" (G-4); "What was going on?" and a reflection not framed as streak-building (G-5); "Your streak starts again…" and "Your next free day starts the next streak" (G-6); "Already slipped? There's grace for that too." in SOS, with 1 John 1:9 and a link to the check-in (G-7); "When you're ready…" (G-8); "held in grace" in place of "grace covers it", and the calendar now says "Slipped, held in grace" like the group (G-9); the insight adds "and you were honest every time" (G-11); the streak ring at 0 says "Starting again…" (G-12); Psalm 51 from verses 10 to 12 (G-14); a line for someone leaving on a hard day (G-15); Romans 8:1 "to those" (S-1).
- Later: G-10 (reactions) in Phase 6, G-13 (reminders and nudges) in Phase 7.

## D-069 · Phase 5 · No extra XP for a clean day

- **Owner (2026-10-10), from the Phase 5 plan:** the spec's "+5 XP for a clean day" is dropped. It made "I stayed free" earn more than an honest "I slipped" (against §2.2), and on the Consistency board it would show a checkin_only member's slip. XP for check-ins is the same +10 for either answer, plus the check-in streak bonus. Free days still count on the Level, Current streak and days-this-challenge boards. Built in Phase 5b.

## D-070 · Phase 5b · The job queue: pgmq and a pg_cron worker

- **Decision (owner approved the plan, 2026-10-12):** slow and fan-out work goes through Supabase Queues (§5): a `jobs` queue and a `jobs_dead` dead-letter queue (the `pgmq` extension, in Supabase's Postgres image; no new npm package). `private.enqueue(type, payload)` adds a job; `private.run_jobs()` runs them, scheduled by pg_cron **every 10 seconds** (`jobs-worker`).
- **Job types:** `user_settle` (one person's check-in XP from a date, badges, XP total and group stats), `group_stats` (a group, or one membership), `challenge_finished`, `encouragement` (Phase 6) and `devotional` (Phase 8). An hourly `challenge-endings-hourly` run queues each finished challenge once (`private.challenge_finish_runs`).
- **What queues them:** triggers, so every path is covered: a new check-in, or a changed answer (`checkins`); joining or being approved, and the owner moving the challenge's dates (group stats). The save itself still replays the person's streaks and level inline (they show on the next page), and no longer touches group stats (D-045 closed).
- **Safety:** every job is idempotent (D-071), runs in its own sub-transaction (a failure undoes only that job), and takes a per-person advisory lock; only one worker runs at a time. A failed job comes back after 60 seconds; on the fifth failure it moves to `jobs_dead` with its error code. A run stops after about 8 seconds and leaves the rest for the next.
- **Privacy:** payloads hold ids and dates only. Finished jobs are deleted (not archived). Dead letters are removed after 30 days, and erasing an account removes its jobs and dead letters. The `pgmq` schema is revoked from `anon` and `authenticated`.
- **Delay:** XP, badges and group stats appear within about 10 seconds of a check-in, not on the "done" page itself. Nothing reads group stats yet but the export; 5c's leaderboards will.
- **Tests:** pgTAP `062_platform_job_queue` (19), `031` runs the worker for group stats.

## D-071 · Phase 5b · XP: an append-only ledger with source keys and reversals

- **Values** (`public.xp_config`, readable by signed-in people, changed with a migration): any check-in **+10**, free or slipped (§2.2, D-069); the check-in streak bonus **+2 per day of the streak from day 1, up to +20** (owner, 2026-10-12: day 1 +2, day 10 and after +20); encouragement **+1, at most 10 a local day** (Phase 6); devotional **+5** (Phase 8); finishing a challenge **+100**.
- **Ledger:** `public.xp_ledger` (user, optional group, the local day it's for, reason, award or reversal, points, `source_key`, `revision`), unique on (`source_key`, `revision`). Owner-only reads; no write grants; a trigger refuses updates and deletes while the account exists (a deleted group's id is cleared; erasure removes the rows).
- **Settling:** a job works out what each source should be worth now and compares it with what the ledger has paid. Equal: it writes nothing, so a replay never pays twice. Different: a reversal row cancels the old amount and a new award follows. Changing "stayed free" to "slipped" changes nothing. A late offline check-in that joins two runs of check-ins re-settles that day and every later one, so their bonuses grow through reversals. Days before the changed one are left alone, so a new `xp_config` value applies from then on and history isn't rewritten.
- **Finishing a challenge:** once the challenge's last day is over in the group's time zone, every member active then (joined by that day, account not closing) gets +100 for that group and Faithful Finisher, once (`challenge_finished:<group>:<user>`).
- **Totals:** `user_stats.xp` (everything) and `group_member_stats.xp_in_group` (the group's own rows plus check-in XP for days inside the member's challenge window), both kept by the jobs, for 5c's Consistency board and its "this week" view (the ledger keeps the local day).
- **Throttling:** 5b adds no public write function: XP and badges are written only by jobs. Phase 6's reaction, nudge and comment functions queue encouragement and call `private.throttle()` themselves (D-051).
- **Export:** an `xp` section (day, reason, entry, points, group) and the totals in `day_counts` and `group_challenge_counts`; the bonus is called `days_in_a_row_bonus` there.
- **Tests:** pgTAP `060_gamification_xp` (33): a slip earns the same as a free day; the bonus curve; replaying four times writes nothing; reversal rows on a late check-in; the daily cap; config applies forward; append-only and owner-only; erasure.

## D-072 · Phase 5b · Badges: awarded once, kept; groups see them at streak or full

- `public.badges` (18, keyed by slug, with a Lucide icon name, a verse reference and its World English Bible text from `data/badge_verses.json`, fetched like D-065); names and one-line descriptions are in `messages/en.json` (`badges.items`). Free days in a row 1, 3, 7, 14, 21, 30, 40, 60, 90, 180, 365 (First Step, Third Day, Sabbath Rest, Two Weeks Standing, Rooted, Month of Mercies, Forty Days, Steadfast, Set Free, Wings Like Eagles, Crowned Year); check-ins in a row 7, 30, 100 (Faithful in Little, Morning by Morning, Daily Bread); Faithful Finisher; and, seeded for Phase 6, Encourager, Prayer Warrior and First Testimony.
- `public.user_badges` (user, badge, earned when). Days-in-a-row badges are worked out by the job from the check-ins themselves (the longest run), inserted with `on conflict do nothing`, and never removed: a trigger refuses updates and deletes while the account exists, so a later edit that shortens the run keeps them.
- **Who sees them (owner, 2026-10-12):** the person on Progress (each badge with its verse, the date, "New" for three days, and the next free-day and check-in badges ahead). A group sees a member's six most recent badges (icons and names, no verse) on its Members page, through `profile_cards.badges`, **only where the member shares their streak or full there** (`util.can_see_level`), because a free-day badge hints at a streak. `user_badges` itself stays owner-only.
- A "New" marker for three days replaces the planned `seen_at` column, so viewing Progress writes nothing.
- **Tests:** pgTAP `061_gamification_badges` (23), Vitest `badges.test.ts` (database, messages and app agree; verses match; names pass the giveaway-word check; no failure words), e2e `xp-badges.spec.ts`.

## D-073 · Phase 5b · The level share card from Level 0, with a preview on Progress

- **Owner (2026-10-12):** the share card was hard to find, and Level 0 had none. Now every level can be shared, Clay included, except where the name gives the topic away (levels 61–66, D-065); `canShareLevel` no longer looks at the number.
- **Preview (owner chose "Progress only"):** on Progress, the level card shows a small picture of the card itself (160 px, `loading="lazy"`, sized up front so nothing shifts, with alt text) above "Save a picture of your level". Home keeps just the link, so Home doesn't draw the picture on every visit.
- Tests: Vitest `levels.test.ts`, e2e `levels.spec.ts` (the link at Level 0) and `xp-badges.spec.ts` (the preview loads).

## D-074 · Phase 5c · Leaderboards: stored rows, read with today's share levels, corrected live

- **Decision (owner approved the plan, 2026-10-12):** five boards per group (CLAUDE.md §7.6): **Consistency XP** (default; the group's `xp_in_group`), **Level** (the live level), **Current streak**, **Free days this challenge** and **Encourager** (encouragement XP given in this group, from Phase 6). XP, Free days and Encourager have a **this week** view (Monday to Sunday in the group's time zone, from `xp_ledger.local_date` and the check-ins' dates); Level and Current streak are "right now" only (owner, 2026-10-12).
- **Stored, refreshed by jobs (§14):** `public.leaderboard_entries`, one row per active membership, with each value and the time it was reached. Every job that changes XP, check-ins or group stats refreshes the rows it touched (`private.refresh_leaderboard`); a new `leaderboard` job type does a group, a person or a membership on its own (a goal set, a stale value). Removal deletes the row at once (a trigger); leaving deletes it by cascade. A whole-group refresh of 5,000 members takes about 3 seconds in a job; one person's, about 6 ms.
- **Read through `public.group_leaderboard(group, board, period, after, limit)`,** for active members only, which applies the membership as it is _now_: **checkin_only members appear only on Consistency XP and Encourager** (a streak, a level or a count of free days would show a slip, D-044); **hiding works only while the covenant allows it** (`leaderboard_hiding_allowed`), and a hidden member **keeps their place without a name, photo or id** (owner, 2026-10-12), except to themselves; closing accounts are left out. Names and photos come from `profile_cards`.
- **Ties go to whoever got there first:** for XP and Encourager, the newest ledger row that counts; for Free days, the newest free day's check-in; for the streak, the check-in that reached it; for the level, the refresh that first saw it. Then the user id, so the order never flickers. Places are 1..n with no shared places.
- **Live values with no nightly job:** a level or streak falls without any event (a missed day, D-063), so each row stores `stale_at`, the next moment its live level or streak could fall (that day's window closing at 12:00 local, or `level_open_until`). A read recalculates the few rows past it (`util.member_level`, `util.live_count`), so the board always matches the level card; the pg_cron `leaderboard-tick` (every 10 minutes) queues those people so the stored rows catch up. `stale_at` is empty at Level 0 with no streak, so inactive members cost nothing. A row stored in an earlier week reads 0 on the this-week views, so the change of week needs no job.
- **Pages:** `/groups/[id]/leaderboard` (tab title "Leaderboard"; boards and periods are links, so no JavaScript; 50 places a page with "Show the next 50", plus "Your place"). The group home's leaderboard card shows the top 5 of Consistency XP and my place. "Clean days this challenge" reads **"Free days this challenge"** (G-3).
- **Speed (target < 200 ms for 5,000 members):** `supabase/bench/leaderboard_5000.sql` seeds 5,000 members with 60 days of check-ins each and reads every board with `EXPLAIN ANALYZE`: 9–31 ms a board, 64 ms for the Together total (sandbox, 2026-10-12). Pages use a rank cursor (`after`), never OFFSET. Redis sorted sets stay the plan for far larger groups (§14).
- **Tests:** pgTAP `070_gamification_leaderboards` (36), `022` (the new functions and tables), Vitest `leaderboards.test.ts`, e2e `leaderboards.spec.ts`.

## D-075 · Phase 5c · The "Together" total and the group goal

- **Together** (`public.group_together`, members only): the sum of each member's free days this challenge, **counted only from members who share their streak or more** in that group. A checkin_only member's answer never moves the number, free or slipped, so a small group can't read a quiet member's slip from it (closes the D-044 question). A streak member's slip already shows through their streak, so counting them reveals nothing new. Hidden members still count (hiding is about the leaderboard). The card says how many members are counted ("Counted from 3 of 4 members…").
- **Goal (owner, 2026-10-12):** one per group, **free days together** only, repeating every **week, month, quarter or year** in the group's time zone ("500 free days together this month"). `public.group_goals`; set or changed by owners and admins with `set_group_goal(group, period, target)`, ended with `end_group_goal(group)`; both throttled (`private.throttle`, `group_goal`, 30 an hour, on top of `lock_group`'s shared bucket) and audited (`group.goal_set`, `group.goal_ended`). Progress counts the same members as Together, from each member's free days in the current period since they joined; the stored rows carry the period's key, so a new period starts at 0 without a job.
- **Group home:** the Together card shows the total, the goal's progress as text and an SVG bar (the CSP blocks inline styles), and for admins a "Set a goal" form inside `<details>` (no JavaScript).
- **Tests:** pgTAP `071_groups_goal_together` (22), e2e `leaderboards.spec.ts`.

## D-076 · Phase 5c · Invite details

- **Owner's request (2026-10-08):** `/groups/[id]/invites/[inviteId]`, for owners and admins (`noindex`, tab title "Invites"): who made it and when, when it ends (or ended), uses so far and the limit, its status (working, expired, stopped, used up), and who joined or asked to join with it, through `profile_cards` (each person's privacy settings apply; closing accounts left out). The rows on the Invites page link to it.
- **Another group's invite id is a 404,** like an unknown one, even for someone who is an admin of both groups: the page reads the invite by id _and_ group. `public.group_invite_people(invite)` returns ids only, for that group's admins; it is in `022_groups_isolation`.
- The link and code can't be shown again (only hashes are kept, D-037), so the page offers **"Replace with a new one"** (the new link and code are shown there, once) and **"Stop"**, which returns to the same page.
- **Tests:** pgTAP `071`, `022`; e2e `invites-detail.spec.ts`, `group-isolation.spec.ts`.

## D-077 · Phase 6a · The encouragement wall: plain-text posts and comments through functions

- **Owner (2026-10-12) approved the Phase 6 plan:** three PRs (6a wall and safety, 6b nudges, partners, the slip page's prayer and milestone cards, 6c Realtime); two active partners per group; Prayer Warrior after praying for 10 people's prayer requests, Encourager after 50 encouragements given; links allowed as text but refused when explicit; owners and admins post and pin announcements; milestone cards on by default from the 7-day badge, each person can turn them off; Realtime through content-free pings on an HMAC topic.
- **Tables:** `posts` (kinds encouragement, prayer request, testimony, announcement, and milestone for 6b; up to 2,000 characters; `pinned` only for announcements, at most three, `wall_pinned_max`), `comments` (one level, up to 500), `reactions` (pray, heart, fire, strong, dove; unique per person, target and kind; "I prayed" is the pray reaction on a prayer request). RLS by active membership; no write grants.
- **Functions:** `create_post`, `edit_post`, `delete_post` (the author; an admin removes anyone's, audited), `pin_post`, `create_comment`, `edit_comment`, `delete_comment`, `set_reaction`; reads through `group_wall` (cursor by time-ordered id, never OFFSET; pinned separately), `wall_post` and `post_comments`. Deleting clears the text at once. Archived groups are read-only; closing accounts can't write and their posts are hidden.
- **Counts are worked out per viewer** (reactions and comments, leaving out blocked people and closing accounts) rather than stored counters, because a block changes them per viewer. Pages are 20 posts, so this reads a few hundred rows at most.
- **Encouragement:** a reaction on someone else's post or comment, or a comment on someone else's post, queues `encouragement` with the group set (+1, at most 10 a day, D-071), keyed per target so taking it back and giving it again never pays twice. The job also awards Encourager and Prayer Warrior (thresholds in `private.app_config`); a testimony queues a `social` job for First Testimony.
- **Pages:** `/groups/[id]/wall` (tab title "Wall"; filters are links), `/groups/[id]/wall/[postId]` (comments), a wall card as the last card of the group home, report and block on the Members page. All forms work without JavaScript; the post and comment forms are the only client components and keep the typed text after an error.
- **Export and erasure:** `my_social_export()` adds posts, comments, reactions, blocked people (ids) and reports made to "Download my data". Erasing an account keeps its posts and comments as "A former member" and removes its reactions, blocks and the reports it made.
- **G-10:** the strong reaction reads "With you".
- **Tests:** pgTAP `080_social_wall` (74) and `022`; Vitest `social.test.ts`; e2e `wall.spec.ts`, `group-isolation.spec.ts`.

## D-078 · Phase 6a · Blocks work both ways, everywhere

- `blocks` (blocker, blocked). `util.blocked_between(a, b)` is true when either has blocked the other, and it closes `util.can_see` (so `profile_cards`), the wall, comments, reaction counts, `group_checkins_today`, other members' rows in `group_members`, and names on the leaderboard (the place stays, without a name, like a hidden member). Neither can comment on, react to or report the other's things: the functions answer as if the post didn't exist.
- Only the blocker can see their own blocks (Settings → Blocked people, with Unblock). The blocked person isn't told.
- You can block anyone you share a group with. A group admin still sees a blocked member's membership row (to look after the group) but not their name or photo.
- 6b adds: a block ends any partnership between them and removes nudges and pending requests.

## D-079 · Phase 6a · Reports go to the group's admins, without the reporter's name

- `report_content(group, post | comment | member, reason, note)`; reasons: unkind, sexual, hateful, spam, unsafe, other. The report copies the text as it was (`snapshot`), so editing or deleting can't hide it; the copy is cleared when an admin resolves the report. One open report per person and target.
- `group_reports` (owners and admins; tab "Moderation" at `/groups/[id]/moderation`) shows what, why, when and how many times, never who: `reporter_id` and `resolved_by` have no column grant. Reports about the reader are left out, and they can't resolve them. Removing the post or comment and `resolve_report` (dealt with or dismissed) are audited.
- A reported owner has no one to review it until Phase 12's platform queue.

## D-080 · Phase 6a · The automatic filter

- Runs inside the database on every post and comment (`private.clean_social_text`, `util.filter_match`), so calling the API directly can't skip it. Refused text answers `content_blocked` and the app keeps what was typed.
- **Slurs** (a short curated list in `private.content_filter_terms`) are matched as whole words after folding case, compatibility forms, accents, invisible characters and look-alike digits; letters may repeat, and words spelled out in single letters are joined first. A doubled letter in a term must stay doubled, so place names like Niger aren't caught.
- **Links** are allowed as plain text (never clickable). A link is refused when its host is an explicit site or one of its subdomains, or on an explicit top-level domain (.xxx, .porn, .sex, .adult, .sexy), or when a part of it is a marked word (xxx, hentai, nsfw…). Words about the struggle itself, and links to help ("covenanteyes.com/porn-addiction-help"), are allowed: this is a recovery app.
- The list is deliberately small; reports and admins are the backstop.

## D-081 · Phase 6a · Everyone's words are plain text

- Posts, comments and report notes are stored as typed (trimmed, control characters removed, no more than one blank line in a row) and rendered as React text with `white-space: pre-wrap`. No markdown, no HTML, no automatic links. A post containing `<script>` or `<img onerror>` shows those characters and nothing runs (e2e). If rich text is ever added, it must go through DOMPurify (§10).

## D-082 · Phase 6b · Nudges: once a day per person, mutable

- `nudges` (group, from, to, kind, the sender's local day). Kinds: Praying for you, Check in today, You've got this, Call me if you need, and Please pray for me (only from the slip page, to a partner).
- **One per sender per recipient per day, in any group,** held by a unique index, so twenty requests at once leave exactly one nudge (e2e); `send_nudge` answers `nudge_already_sent` to the rest. `private.throttle` adds 60 an hour (the app allows 50).
- **Muting:** `privacy_settings.nudges_muted` (everywhere, on Settings) and `group_members.nudges_muted` (one group, on the group's Settings). People who muted don't get a Nudge button at all (`group_nudge_targets`), and the database refuses with `nudges_muted`.
- Received nudges show in a "For you" card on Home and on the group home (last three days) until Phase 7's notifications. Nobody else can read them; a block removes them.
- A nudge is encouragement: +1 XP in that group (once per nudge, at most 10 a day with the rest) and it counts toward Encourager.

## D-083 · Phase 6b · Accountability partners

- `partnerships` (group, who asked, who was asked, pending / active / ended, each person's alert choice). Inside one group, both must agree; **at most two active partners per person per group** (owner, 2026-10-12; requests count while open). Requests lapse after 14 days. Either partner ends it at any time; the reason isn't shown.
- **What a partner sees:** `util.are_partners_in(group, a, b)` gives each partner the other's mood, urges and triggers in `group_checkins_today` **only in that group**; `util.are_partners` (any shared partnership) opens what someone set to "partners only" on their profile (the testimony starts there). It replaces the Phase 2 stand-in (D-044).
- **Alerts:** each person chooses whether their partner may be alerted when they miss two days or press SOS (`set_partner_alerts`). The alerts themselves arrive with notifications (Phase 7) and SOS (Phase 8).
- **What ends a partnership:** leaving or being removed from the group, a block either way, or starting to close the account (triggers), as well as either partner.
- Page: `/groups/[id]/partner` (tab "Partner"). Functions: `request_partner`, `respond_partner` (accept, decline, or withdraw by the one who asked), `end_partnership`, `set_partner_alerts`, `my_partnerships`.

## D-084 · Phase 6b · Asking for prayer from the slip page

- The slip page's card (D-046) now offers "Ask {partner} to pray" (a "Please pray for me" nudge) and "Ask my group to pray" (a prayer request on the chosen group's wall, pre-filled with "Please pray for me today.", which the person can change). Nothing in either says what happened.
- The page stays at `/check-in/done?date=…` for both answers (D-055); the result comes back as a neutral `?prayer=` value.

## D-085 · Phase 6b · Milestone cards

- When the job awards a free-days badge **from 7 days up** (owner, 2026-10-12), a trigger posts a milestone card (a `posts` row of kind `milestone`, carrying the badge, no text) to each group where the member is active and shares their streak or more. One card per group, person and badge.
- A card shows only while its member still shares their streak or more there and keeps cards on (`util.milestone_visible`, applied in RLS and the wall), because it hints at a streak, like a badge (D-072). **On by default; each person can turn them off** in Settings (`privacy_settings.milestone_cards`).
- Everyone in the group can react to and comment on a card; its member can delete it but not edit it.

## D-086 · Phase 6c · Live updates: content-free pings on a daily HMAC channel

- **Owner (2026-10-12) chose the HMAC topic.** The browser never holds a session token (httpOnly cookies, D-020), so Supabase Realtime's private channels can't authorise it. Instead:
  - The database broadcasts **pings that carry only what changed** (`{"what": "wall"}` or `{"what": "today"}`) with `realtime.send(…, private => false)`, from triggers on posts, comments, reactions, check-ins and memberships. A failed ping never fails the write.
  - The channel is `group:` + 40 hex characters of HMAC-SHA256(group id and the UTC day) with a key in `private.realtime_keys` that never leaves the database. `group_live_topic(group)` gives today's name **to active members only**; it changes every day, so a former member's copy goes stale within a day.
  - On a ping the page asks the server again (`router.refresh()`), so RLS, blocks and share levels decide everything shown. Someone who learned a name can only learn that "something changed" in that group that day, and can only cause harmless refreshes.
- **Accessibility:** Today and reactions refresh quietly, waiting while the person is typing or has a menu open. On the wall, new posts appear only when the reader presses "Show it", announced in a polite live region, so nothing moves under a screen reader.
- **Performance and kill switch:** the Realtime client (`@supabase/realtime-js`, now listed in package.json; it was already installed with supabase-js) is loaded after the page is idle, so it isn't part of the first load; `NEXT_PUBLIC_REALTIME_ENABLED=false` turns it off (§14). One channel per group page; Realtime runs in CI's e2e job now.
- **Tests:** pgTAP `082_social_live` (17), e2e `live.spec.ts` (a second person's post and check-in reach an open page).

## D-087 · Phase 6c · Reactions on check-ins

- Members react to another member's check-in in the Today panel (the five reactions). `group_checkins_today` gains `checkin_id` (only when the member checked in today): it reveals nothing beyond "checked in today", which every member already sees. `react_to_checkin(group, checkin, kind, on)` checks the check-in belongs to another active member of that group, not blocked either way; `group_checkin_reactions(group)` gives counts and mine. +1 encouragement XP once per check-in. Reactions go when their check-in goes.

## D-088 · Phase 7a · Owners and admins see who is hidden on the leaderboard

- **Owner's request (2026-10-13):** a member who hides from a group's leaderboard (while the covenant allows it, D-074) stays nameless to other members, but the group's **owners and admins** now see who it is. `public.group_leaderboard` returns the member's id to them (so the name and photo, through `profile_cards`), still with `is_hidden = true`; the row reads **"Hidden from members"**.
- **Unchanged:** members never receive the id, on the page or through the API; a block either way still hides the name from everyone, admins included (D-078); hiding only applies while `leaderboard_hiding_allowed` is on; the member sees their own row as before.
- **Members are told:** the covenant ("Members may hide from the leaderboard. The owner and admins still see who they are."), the hide checkbox's hint when joining and in the group's Settings, and the note on the board.
- **Why it's acceptable:** owners and admins already see every membership row (to look after the group, D-078); hiding is about the ranking shown to peers, not about secrecy from the group's leaders.
- **Tests:** pgTAP `070` (+7: owner and admin see the id still marked hidden; a demoted admin and plain members don't; a block either way hides it), Vitest `leaderboards.test.ts` (the copy says so), e2e `leaderboards.spec.ts` (the owner's page shows the name with "Hidden from members"; members' API results carry no id; a block hides it).

## D-089 · Phase 7b · Notifications: one pipeline, ids only, through the queue

- **Owner (2026-10-13) approved the Phase 7 plan:** three PRs (7a the leaderboard change, 7b the pipeline and in-app, 7c push and email); a push-only service worker and a minimal manifest now (Phase 10 builds on them); the `web-push` package; "member joined" to owners and admins only; with discreet mode off, push may name the other person and a neutral action, never a group's name or anyone's words.
- **The pipeline:** a trigger (or the scheduler, D-091) calls `private.notify(event, ids)`, which puts one small job on a new pgmq queue, `notify` (dead letters in `notify_dead`, kept 30 days). The write that caused it returns at once. `private.run_notify()` (pg_cron **every 5 seconds**, its own queue so a big group never delays XP jobs) works out each job's recipients, **500 a job** (`notify_fanout_page`): a bigger group queues the rest as a follow-on job. `private.deliver()` then, in one statement:
  - leaves out the actor, a pair blocked either way, closing or erased accounts, and anyone no longer an active member of the group;
  - skips anyone already told (`dedupe_key`, per person), or folds into an unread row (`fold_key`: "Sam and 2 others reacted", one row per post for reactions, comments and "I prayed"; one per group for join requests and reports);
  - plans each channel for the new rows (D-090);
  - and sends each person a content-free ping on their own daily channel (`user:` + HMAC of the id and UTC day, D-086's key; `my_live_topic()`).
- **Events:** nudges (`pray_for_me` too, skipped if muted since); reactions on my post, comment or check-in (and "I prayed" on my prayer request as its own type); comments on my post, and replies to earlier commenters (at most 20); prayer requests, announcements and milestone cards to the group (cards only while their member shares their streak or more, D-085); join requests and joins to owners and admins; reports to owners and admins except whoever it's about, never naming the reporter (D-079); partner requested, accepted, or ended by the other (lapsing, leaving, a block or closing tell nobody); badges and level ups to the person only (never a level down, §7.6); a challenge's first and last day; covenant changes waiting for an answer (D-039); security alerts (a new device after the first, a changed password). Partner SOS has `public.send_partner_sos(group?)` (throttled, 5 an hour) for Phase 8's button.
- **Rows hold ids and small codes only** (a reaction kind, a level number, a badge slug), never text; the words come from `messages/en.json` when the page renders (`src/features/notifications/text.ts`).
- **Groups stay isolated:** leaving or being removed deletes that group's notifications; a block deletes what each was told about the other; the centre shows a group's name only while I'm still in it, and the actor only while neither has blocked the other. `notifications` is in `022`'s every-table check, and the two functions taking a group are in its meta-test.
- **In-app:** the bell is the Alerts item in the navigation, with an unread badge (screen readers hear "Alerts, 3 unread"); the group switcher shows each group's unread count. `LiveAlerts` (lazy, after idle, sharing one Realtime socket per tab with `LiveGroup` through `@/lib/realtime/client`) re-reads the counts from `/api/notifications/unread` (numbers only) after a ping or when the tab returns, shows a toast in the polite region when the count rises, and sets the app-icon badge (Badging API). The centre (`/alerts`) lists 30 at a time (cursor on time and id); each item is a plain link to `/api/notifications/<id>/open` (marked read, then on to where it leads; never prefetched); "Mark as read" and "Mark all as read" are forms. Everything works without JavaScript.
- **Retention:** notifications 90 days (their deliveries with them), checked every 15 minutes (§11). Erasing an account removes its notifications, deliveries and queued jobs; an actor's erasure clears `actor_id` ("Someone").
- **Export:** `my_notifications_export()` adds notifications (types, codes, dates), channel choices, muted groups and push devices (labels only) to "Download my data".
- **Fire every type:** `npm run notify:fire -- you@example.com [type]` (local database only, through `supabase db query --local`) runs each of the 21 types through `private.deliver` and prints what happened on each channel.
- **Tests:** pgTAP `090_notifications_core` (73), `022`; Vitest `notifications.test.ts` (the catalogue matches the migration; every type has words, a name and a page inside the app; no failure words); e2e `notifications.spec.ts`.

## D-090 · Phase 7b · Channels: preferences, snooze, quiet hours, digest, mutes and limits

- **Catalogue:** `public.notification_types`, 21 types in 7 sections, each with its push and email default. In-app is always on. Push is on by default for nudges, comments and replies, "someone prayed for you", announcements, challenges, covenant changes, partner requests and alerts, partner SOS, join requests, reports, the daily reminder, the evening reminder and security; off for reactions, new prayer requests, milestones, level ups, badges, joins and the Sunday recap. **Email is off by default** except security (Gmail SMTP sends about 500 a day, D-031). Security alerts are locked on; their email is the account's own (D-030), so the pipeline never sends it twice.
- **Preferences:** `notification_preferences` stores only choices that differ from the default (`set_notification_preferences`, one save for the whole grid). Settings: `update_notification_settings` (quiet hours, digest, discreet mode, sound, vibration), `snooze_notifications(day | week | off)`, `set_group_notifications_muted`. The reminder time stays a column the person updates directly (as in onboarding). Nudge mutes (D-082) are not duplicated: the grid points to them.
- **Planning a channel** (`private.plan_channel`, one `private.notification_deliveries` row per notification and channel): channel off, no push device, or a muted group → no row at all; **partner SOS and security** → ready now, whatever else is set; snoozed → held until the snooze ends; **in quiet hours** (default 22:00–07:00 local) → held until they end; digest on and the type can wait → kept for the digest; past the hourly limit (6 pushes, 3 emails, `app_config`) → skipped, still in the bell; otherwise ready. Held rows are planned again when their time comes (`release_held`, every worker run), so a snooze that ends at night waits for the morning. Turning the digest off releases what was waiting; waking from a snooze releases what it held.
- **Digest:** at 19:00 local, daily or on Sundays, everything waiting goes as one push and one email ("4 new updates") and is marked bundled. Reminders, partner alerts, the recap and security are never bundled.
- **Deliveries are private:** never exposed through the API; the person sees their settings and devices only. Closing an account marks its waiting deliveries skipped. Phase 7c's sender claims `ready` rows.
- **Tests:** pgTAP `090` (defaults, no device, quiet hours and their end, SOS through quiet hours and only with consent, snooze, security through snooze and never emailed twice, digest and its once-a-day, group mute, the hourly limit, email by choice, paging, leaving, closing).

## D-091 · Phase 7b · The reminder scheduler

- `private.notify_schedule()`, pg_cron **every 15 minutes** (`notify-schedule`), picks people by their own local time and queues one `direct` job each (so the worker spreads the work), checking the dedupe key first. A **30-minute window** means one missed run loses nothing, and the keys mean a repeated run never sends twice.
  - **Daily reminder** at the person's `reminder_time`, if they haven't checked in today.
  - **Evening reminder** ("There's still time to check in today") at 20:00 local, when yesterday was answered and today isn't yet (the streak would end at noon tomorrow).
  - **Partner missed check-ins:** once the second day without a check-in has closed (its window ends at 12:00 the day after) and none today, each active partner the person allowed alerts for (D-083) hears once per absence (the key is the last check-in's date). Never the answer itself; the account must have existed both days.
  - **Sunday recap** at 18:00 local.
  - **A challenge's first day**, once per group (`private.challenge_start_runs`); its end comes from the hourly `challenge_finish_runs` (D-071).
  - Digests (D-090) and retention.
- Closing accounts get nothing. All hours are in `app_config`.
- **Tests:** pgTAP `091_notifications_schedules` (21): the reminder at the person's own time (Kolkata and UTC), once, not after a check-in, not for closing accounts; the evening reminder; partner alerts only after two closed days, once per absence, only with consent, naming the partner and nothing else; the recap; a challenge's first day once; retention.

## D-092 · Phase 7c · Push and email: the database calls the sender; discreet words; one-click unsubscribe

- **The sender is the app's own route,** `POST /api/notify/deliver` (Node: Web Push needs the VAPID private key and payload encryption, email needs the React Email templates). The database calls it through **`pg_net`** every 10 seconds, but only when a delivery is waiting (`private.kick_sender`), with `Authorization: Bearer <CRON_SECRET>` (no new secret). Its address and the secret are kept in **Supabase Vault** (`public.notify_configure(url, secret)`, secret key only); locally the database reaches the app as `host.docker.internal` (`npm run notify:configure`, run by the launcher on every start). Vercel's free cron runs only daily, so this works on any host.
- **Claiming:** `notify_claim(limit)` (secret key only) marks ready rows `sending` (or takes back ones claimed over 2 minutes ago and never finished, so a crashed sender loses nothing and a working one never sends twice), and returns only what's needed: the type and codes, discreet mode, sound and vibration, the other person's display name **only where the recipient may see that profile** (`util.can_see`, blocks), the address for email, the devices for push, the unread count for the app-icon badge. `notify_finish(results)` records sent, retry (ready again, failed on the fifth try) or failed with a reason. The route sends for up to 20 seconds a call, 10 at a time.
- **Web Push:** the `web-push` package (owner, 2026-10-13; server-only, 0 audit findings) with VAPID keys from the environment (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); unset = push is off and hidden. Partner SOS and security are sent "high" urgency with a 1-hour TTL; the rest "normal", 24 hours. **A 404 or 410 from the push service deletes that subscription at once** (`notify_finish`'s `gone`); a closing account loses every subscription; at most 10 devices a person; an endpoint moves to whoever saved it last (one browser, one person).
- **The service worker** (`public/sw.js`, owner chose "now"): push only: show the notification (neutral title, the line, the person's sound and vibration choices), set the app-icon badge, open the app at the notification's page (paths inside the app only), and re-save a replaced subscription. Nothing is cached; Phase 10 adds caching and offline. Served `no-cache` with its own CSP. A minimal manifest (`src/app/manifest.ts`: the neutral name, `display: standalone`, any/maskable/monochrome icons from the app icon) and an Apple touch icon make Add to Home Screen possible, which iPhones need for push (iOS 16.4+).
- **Asking:** the explainer card ("Hear from your group on this device?") appears only after a first check-in (the thank-you page, and Home once there's a check-in), only while this device could still be asked; the browser's own prompt comes only when the person presses "Turn on notifications". "Not now" is remembered on that device (`localStorage`, a per-device convenience). Safari on iPhone or iPad outside the Home Screen shows the three Add to Home Screen steps instead. Settings → Notifications has this device's switch and every device with Remove.
- **The words (`outbound.ts`):** discreet mode (on by default) uses a handful of neutral lines ("You have a new message from your group", "A gentle reminder for today", "Someone in your group is asking for prayer right now"); off, the other person's name and a neutral action ("Sam sent you encouragement"). **Never, in either mode:** a group's name, anyone's words, a badge or level name, or a count of days. The title is always the app's name. Email subjects are always "You have a new update" (or the digest's, or "A security alert for your account"). `src/test/discretion.test.ts` renders every type, every code, both modes, with and without a name, against a group named to give the topic away.
- **Email:** React Email (`src/emails/notification.tsx`), sender "Holy Auramaxing", one line, a button into the app, and **one-click unsubscribe per type (RFC 8058)**: `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` point at `/api/notify/unsubscribe`, whose POST turns that type's email off (or the digest); the body's link opens `/unsubscribe`, a confirmation page with one button. Links are signed (HMAC-SHA256 with a key derived from `APP_ENCRYPTION_KEY`, D-025), so they need no session and can't be moved to another person or type; a GET only shows the page, so mail scanners change nothing. Security alerts can't be unsubscribed. Gmail's ~500 a day (D-031) is why email is off by default.
- **Speed:** the worker now keeps reading while it has time, so a big group's follow-on jobs run in the same pass. `npm run bench:notify` seeds 5,000 members, times pages before and during an announcement's fan-out and reports p50/p95 (results in the Phase 7 handoff).
- **Tests:** pgTAP `092_notifications_delivery` (32); Vitest `delivery.test.ts` (signed links, 404/410 and retries, the worker's safe paths, no logging of addresses) and the discretion test; e2e `delivery.spec.ts` (a real email from an announcement into Mailpit with RFC 8058 headers, a scanner's GET changing nothing, one click turning it off, a tampered link refused, the page; the explainer after a check-in and "Not now"; the iPhone guide; the manifest and service worker).
