# Holy Auramaxing

A grace-centred web app and installable PWA for daily check-ins, small-group challenges, accountability and Scripture. The full product spec is in [`CLAUDE.md`](CLAUDE.md), and the build is split into phases in [`PROMPTS.md`](PROMPTS.md).

**Status:** Phases 1–4 and the four post-Phase 4 reviews (security, privacy, accessibility, grace and tone) are done. Phase 5 (levels, XP, badges, leaderboards) is done. Phase 6 (social and encouragement) is in review in three parts: 6a (the encouragement wall, reactions, report and block), 6b (nudges, partners, asking for prayer, milestone cards) and 6c (live updates, reactions on check-ins).

## What you need

| Tool                                                              | Version                                           | Why                                      |
| ----------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| [Node.js](https://nodejs.org)                                     | 22.12 or newer (24 LTS recommended, see `.nvmrc`) | Runs the app and tooling                 |
| [Git](https://git-scm.com)                                        | any recent                                        | Source control                           |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | running                                           | Local Supabase (Postgres, Auth, Storage) |

You don't need to install the Supabase CLI globally: it's a dev dependency, so use it through `npx supabase …`.

## Set up from a fresh clone

```bash
git clone https://github.com/Paulzhub/holy-auramaxxxing.git
cd holy-auramaxxxing
npm ci
cp .env.example .env.local          # Windows PowerShell: Copy-Item .env.example .env.local
```

Start the local database. This needs Docker Desktop running, and the first run downloads images, which takes a few minutes:

```bash
npx supabase start
```

When it finishes, it prints the local URLs and keys. Copy two of them into `.env.local`:

- `Publishable key` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `Secret key` → `SUPABASE_SECRET_KEY` (server-only; never prefix it with `NEXT_PUBLIC_`)

Run `npx supabase status` any time to see them again. After changing `supabase/config.toml` or the email templates, run `npx supabase stop` and `npx supabase start` again.

### Emails while developing

Supabase sends sign-up, magic-link and password-reset emails to a local inbox, **Mailpit**, at <http://127.0.0.1:54324>. Nothing leaves your computer.

The app's own security emails ("New sign-in", "A recovery code was used", "A passkey was added") go there too when `.env.local` has `EMAIL_PROVIDER=mailpit` and `MAILPIT_URL`. With a `RESEND_API_KEY` and no `EMAIL_PROVIDER`, they go through Resend instead. Without a verified sending domain, Resend only delivers to your own Resend account's address (D-030). For a small launch without a domain, a Gmail account over SMTP works instead (D-031; see Production notes).

### Two-step sign-in and passkeys

- **Two-step sign-in:** Settings → Security → "Set up an authenticator app". Scan the QR code with any authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…). From then on, signing in asks for its code.
- **Passkeys** need `PASSKEYS_ENABLED=true` in `.env.local`, and the app must be opened at **http://localhost:3000**, not `http://127.0.0.1:3000`. Passkeys are tied to the host name, and `supabase/config.toml` names `localhost`. Chrome, Edge and Safari can make passkeys with the computer's PIN, fingerprint or face; Windows Hello works too.

### Google sign-in (optional locally)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** (type: Web application).
2. Add the authorised redirect URI `http://127.0.0.1:54321/auth/v1/callback`.
3. Copy `supabase/.env.example` to `supabase/.env` and paste the client ID and secret there. Never commit that file.
4. Restart Supabase (`npx supabase stop`, then `npx supabase start`).

Without these, everything else works; only the Google button fails.

### Profile photo screening (optional locally)

Under `npm run dev`, photos are approved by a stand-in screener, so you don't need Google. To try the real check, or in production:

1. In the same Google Cloud project, enable the **Cloud Vision API** (billing must be on, even for the free tier).
2. Create an **API key** under APIs & Services → Credentials and restrict it to the Cloud Vision API.
3. Put it in `.env.local` as `GOOGLE_CLOUD_VISION_API_KEY=…`. Never commit it. An API key starts with `AIza`; the OAuth client secret (`GOCSPX-…`) from Google sign-in is a different thing and won't work.

A production build with no key keeps every new photo unpublished (D-026). To try a production build on your own computer (`npm run build` then `npm start`) without a key, add `IMAGE_SCREENING_PROVIDER=stub` to `.env.local`. Never set that in a real deployment.

When something can't be saved under `npm run dev`, the terminal running it explains why (lines starting `[avatar]`, `[profile]` or `[onboarding]`); people only ever see a gentle message.

Run the app:

```bash
npm run dev
```

Then open <http://localhost:3000>. Useful pages:

- `/`: public landing placeholder
- `/sign-up`: create an account (age question → consent → Google or email). Then confirm the email from Mailpit.
- `/sign-in`: password, Google or an emailed link; `/forgot-password` for resets
- `/welcome`: onboarding for new accounts (five optional steps)
- `/me` and `/me/edit`: your profile, photo and privacy settings
- `/settings/security`: two-step sign-in, recovery codes, passkeys, devices and sessions
- `/settings/data`: download your data (one zip with JSON and CSV), or delete your account (14 days to change your mind, then `/account-closing` until it's erased)
- `/sign-in/verify`: the two-step code page (after signing in, when two-step sign-in is on)
- `/home`: the app shell (Home, Groups, Check in, Alerts, Me, Settings). You need to be signed in.
- `/privacy`, `/terms`, `/your-data`: draft policies (waiting for legal review)
- `/dev/components`: every component in every state. It's on automatically in `npm run dev`; in a production build it needs `ENABLE_DEV_PAGES=true`.
- `/api/health`: shows whether Supabase is configured and reachable
- Supabase Studio: <http://127.0.0.1:54323>

### After pulling a new phase

Each phase may add database tables, settings or packages. After switching branch or pulling:

```bash
npm ci                         # new packages
npx supabase migration up      # new tables; keeps your local accounts
```

Then compare `.env.local` with `.env.example` for new settings (2b added `APP_ENCRYPTION_KEY`; 2d added `EMAIL_PROVIDER`, `PASSKEYS_ENABLED` and the optional `RESEND_API_KEY`/`EMAIL_FROM`; 2e added `CRON_SECRET`; Phases 3, 4, 5a–5c, 6a and 6b add none; 6c adds `NEXT_PUBLIC_REALTIME_ENABLED` (defaults on); 7a and 7b add none; 7c adds `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (generate a pair with `npx web-push generate-vapid-keys`), and needs `CRON_SECRET` for the notification sender: their tunable values live in the database, D-064, D-071; security review 2 and privacy review 2 add none). Since 7c, run `npm run notify:configure` after `npx supabase start` (or a reset) so the database can reach the sender; the launcher does it for you, and restart `npm run dev`: environment files are read only at start-up. When `supabase/config.toml` changed (2d did), restart Supabase too: `npx supabase stop`, then `npx supabase start`.

> **Windows tips**
>
> - Keep the project **outside OneDrive** or any other synced folder. Syncing `node_modules` is slow and causes "file in use" errors.
> - If `npx supabase start` can't find Docker, open Docker Desktop and wait until it says "Engine running".
> - Use PowerShell or Windows Terminal. Every command above works there unchanged.

## Everyday commands

| Command                                      | What it does                                                                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                | Dev server with hot reload                                                                                                                                                                                           |
| `npm run build` / `npm start`                | Production build and server                                                                                                                                                                                          |
| `npm run lint`                               | ESLint (accessibility rules, module boundaries, no hard-coded strings)                                                                                                                                               |
| `npm run format`                             | Prettier                                                                                                                                                                                                             |
| `npm run typecheck`                          | TypeScript, strict                                                                                                                                                                                                   |
| `npm test`                                   | Unit tests (Vitest), including colour-contrast checks on the design tokens                                                                                                                                           |
| `npm run test:e2e`                           | Playwright end-to-end tests, including axe in both themes and the sign-up, sign-in and reset flows. **Needs `npx supabase start` and `npm run build` first.** The first time, run `npx playwright install chromium`. |
| `npm run test:db`                            | pgTAP database tests (needs `npx supabase start`)                                                                                                                                                                    |
| `npm run lighthouse`                         | Lighthouse CI, failing below 95 in any category, on public, sign-in and signed-in pages. Needs Supabase running and `npm run build` first.                                                                           |
| `npm run accounts:purge`                     | Erases accounts whose 14 days are over and removes their photos now (the app must be running; needs `CRON_SECRET`). The database also erases them daily on its own.                                                  |
| `npm run notify:fire -- you@example.com`     | Fires every notification type (or one: add its name) at that local account through the real pipeline and prints what each channel did (D-089)                                                                        |
| `npm run notify:configure [-- port]`         | Tells the local database where the app's notification sender is (`host.docker.internal:3000` by default), so push and email go out (D-092)                                                                           |
| `npm run bench:notify`                       | Seeds a 5,000-member group, times pages before and during an announcement's fan-out (p50/p95), then removes it. Needs the app on port 3100 and the e2e session (`npx playwright test --project=setup`)               |
| `npm run db:types`                           | Regenerate `src/lib/supabase/database.types.ts` from the local database after a migration (CI checks it's current).                                                                                                  |
| `npm run check`                              | Lint + format + typecheck + unit tests + build: what CI's first job runs                                                                                                                                             |
| `npx supabase db reset`                      | Rebuild the local database from `supabase/migrations`                                                                                                                                                                |
| `npx supabase migration new <module>_<what>` | Create a new migration (see naming below)                                                                                                                                                                            |

## Project layout

```
src/
  app/[locale]/(public)/     public pages (landing for now)
  app/[locale]/(app)/        the signed-in app (Home, Check in, Progress, Groups, Me, Settings…)
  app/[locale]/(join)/       /join: the app shell when signed in, the sign-in frame when not
  app/[locale]/_frames/      the two page frames (app shell, sign-in frame) shared by the layouts
  app/[locale]/(app)/dev/    the component gallery
  components/ui/             design-system components
  components/shell/          app shell: navigation, theme switcher, brand
  components/image-picker/   the square photo picker shared by avatars and group pictures
  features/<module>/         one folder per module (auth, groups, checkins, …);
                             other code imports a module only via its index.ts
  i18n/                      next-intl routing and request config
  lib/                       security (CSP, headers), theme, Supabase clients, env, images
  styles/                    tokens.css (design tokens), components.css, shell.css
  proxy.ts                   per-request CSP nonce + locale routing
messages/en.json             every user-facing string
supabase/migrations/         versioned SQL, named <timestamp>_<module>_<what>.sql
supabase/tests/database/     pgTAP tests
tests/e2e/                   Playwright specs (axe, keyboard, theme, headers, shell, groups, check-ins)
docs/                        decisions, threat model, design system
```

## How things work

- **Theme.** Light, dark or system, set from the switcher in the header, sidebar or Settings. Your choice is saved in a `theme` cookie, so the server sends the right colours in the very first HTML; there's nothing to flash. A tiny inline script, allowed by the CSP nonce, covers the case where the cookie is missing but the local cache has your choice. With JavaScript turned off, the switcher still works through a Server Action.
- **Strings.** All user-facing text lives in `messages/en.json`. ESLint fails on hard-coded text in JSX, and a unit test checks that every message parses. Browser tab titles use the app's one name, "Holy Auramaxing" (D-059).
- **Security headers.** `src/proxy.ts` sends a strict, nonce-based Content-Security-Policy on every page. `next.config.ts` adds HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, COOP/CORP and `X-Frame-Options`. See `docs/threat-model.md`.
- **Module boundaries.** ESLint stops one module from importing another module's internals. Each module has two public entry points: `@/features/x` (server functions and server components) and `@/features/x/ui` (client components). They are separate so that server helpers never pull client code into a page (docs/decisions.md D-023). A module can add page-specific client entry points, `@/features/x/ui-<page>` (for example `@/features/groups/ui-manage`).
- **Security (Phase 2d).** Optional two-step sign-in with an authenticator app, ten single-use recovery codes, and passkeys (Supabase Auth). A database policy (`util.session_ok()`) hides every personal row from a session that hasn't entered its code yet or has been signed out from another device. Settings → Security lists your devices (no IP addresses) and signs them out. A new device triggers a discreet "New sign-in" email (D-028–D-030).
- **Your data (Phase 2e).** Settings → Your data downloads everything as one zip (`data.json`, a CSV per table, your photo). Deleting the account hides your profile at once, signs out your other devices and emails you; for 14 days signing in shows only "Keep my account". Then a daily database job erases the account and everything personal, and the app removes your photo files (D-032, D-033).
- **Groups (Phase 3).** Anyone with a verified email starts a group in five short steps (name, challenge, who can join, covenant, check). Invite people by link, short code or a QR code in the app's own colours; each invite works for 1–30 days, can have a use limit, and can be stopped or replaced. The link and code are shown once: only scrambled copies are stored. `/join` shows signed-out visitors just the group's name and member count; signed in, it shows the covenant and asks what you'll share (never less than the group's minimum). The header's switcher lists your groups. Every change to a group goes through a database function that checks your role in that group, and is audited; a member of one group can't see or touch another, page or API (pgTAP `020`–`024`, `tests/e2e/group-isolation.spec.ts`; D-034–D-041).
- **Check-ins (Phase 4).** Once a day, "I stayed free today" or "I slipped", with optional mood, strongest urge, triggers and a private note (encrypted with your id and the day bound in; nobody else can read it, admins included). "Today" is your own day in your time zone, and yesterday stays open until 12:00. Streaks, longest streak, clean days and the check-in streak are recalculated in the database from your check-ins every time you save, so changing an answer always comes out right; a missed day just ends a run, it is never a slip. A slip opens a grace page: a verse, everything you've kept (clean days, streaks built, your longest), an optional private reflection and one next step. `/progress` has your calendar, mood and urge charts and plain-language insights. Groups see you only through a database view that applies what you share **with that group**: check-in only shows "checked in today", streak adds your streak, full adds your answer (pgTAP `030`–`032`; D-042–D-049).
- **Levels (Phase 5a).** Every free day fills a progress bar (5 days a level up to Level 20, then 10), through 1,003 named levels from "Clay" to "Well Done Ultra Pro Max", each with an era and a World English Bible verse. An honest slip and a missed day cost the same 10 levels, so staying silent never beats telling the truth; days while an account is closing are paused. The level is replayed in the database on every save and read "live", so missed days count even if someone never opens the app. Groups see it only where you share your streak or more. A check-in made offline can be sent up to 7 days later and counts for the day it was made (`POST /api/checkins/sync`; the device side is Phase 10). (pgTAP `050`–`051`; D-063–D-068.) The share card works from Level 0, and Progress shows a small preview of it (D-073).
- **XP, badges and the job queue (Phase 5b).** Every check-in earns 10 XP whether you stayed free or slipped, plus 2 a day for checking in on days in a row (up to 20). XP sits in an append-only ledger: corrections are reversal rows, and every award has a key, so running a job again never pays twice. Eighteen badges, each with an icon and a verse, are earned once and kept; groups see a member's badges only where they share their streak or more. XP, badges and group stats are worked out by a queue (Supabase Queues, `pgmq`) that a pg_cron worker runs every 10 seconds, with retries and a dead-letter queue (pgTAP `060`–`062`; D-070–D-073).
- **Leaderboards, Together and the group goal (Phase 5c).** Each group has five boards (Consistency XP, Level, Current streak, Free days this challenge, Encourager), this week or all time, with ties going to whoever got there first. Members who share only that they checked in appear only on Consistency and Encourager; hiding works only where the covenant allows it, and a hidden member keeps their place without a name. The boards are stored and refreshed by the job queue, and a level or streak that has fallen since is recalculated when the board is read. The Together total and the group's repeating goal ("500 free days together this month") count only members who share their streak or more, so a quiet member's slip never shows. Admins can open each invite to see who made it and who used it (pgTAP `070`–`071`; D-074–D-076). Speed check: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/bench/leaderboard_5000.sql` (5,000 members, every board under 200 ms).
- **The encouragement wall (Phase 6a).** Each group has a wall of encouragement, prayer requests (with "I prayed"), testimonies and pinned announcements, one level of comments, and five reactions. Everything is plain text, and a filter in the database refuses slurs and links to explicit sites. Report a post, comment or member to the group's admins (they never see who reported), or block someone: neither of you then sees the other anywhere. Reactions and comments for others earn encouragement XP on the group's Encourager board (pgTAP `080`; D-077–D-081).
- **Nudges, partners and milestones (Phase 6b).** Send a friend one nudge a day ("Praying for you", "Check in today", "You've got this", "Call me if you need"); mute them everywhere or in one group. Ask someone in a group to be your accountability partner (up to two per group): partners see each other's mood, urges and triggers in that group and choose their own alerts. After a slip, ask your group or your partner to pray from the same page. Reaching 7, 14, 21… free days posts a card your group can celebrate, where you share your streak (pgTAP `081`; D-082–D-085).
- **Live updates (Phase 6c).** A group's home and wall update while open: check-ins and reactions appear by themselves, and new posts wait behind a "Show it" button. The database sends only "something changed" on a channel whose name only members get and which changes daily; the page then asks the server again, so nothing private travels over the connection. Members can also react to each other's check-ins. Set `NEXT_PUBLIC_REALTIME_ENABLED=false` to turn live updates off (pgTAP `082`; D-086–D-087).
- **Notifications (Phase 7).** Everything that happens (a nudge, a reaction, a comment or reply, "someone prayed for you", a new prayer request, an announcement, a milestone, a challenge starting or ending, a covenant change, a partner request or alert, a level up or badge, a join request, a report, a security alert) queues one small job; a worker fans it out 500 people at a time, leaving out blocked people and closing accounts, and writes ids only. The bell (the Alerts item) shows an unread count, live, with a polite toast and the app-icon badge; Alerts lists them with "Mark as read" and "Mark all as read"; the group switcher shows each group's count. Settings → Notifications chooses push and email per type, the reminder time, quiet hours (22:00–07:00 by default; a partner asking for prayer and security alerts still come through), a daily or weekly digest, discreet mode (on: push and email never say who or what), snooze, and muting a group. A 15-minute scheduler sends reminders at each person's own time, the evening "still time today", partner alerts after two quiet days (only where allowed), the Sunday recap and challenge starts. Push uses Web Push (VAPID) through a small service worker (`public/sw.js`); the explainer appears only after a first check-in, and iPhones are shown how to add the app to the Home Screen first. Emails have neutral subjects and one-click unsubscribe (RFC 8058). The database calls the sender, `/api/notify/deliver`, through `pg_net` when something is waiting (pgTAP `090`–`092`; D-089–D-092). Owners and admins see who is hidden on the leaderboard (D-088).
- **Accounts.** Sign-up asks "Are you 18 or older?", then shows a plain-language consent notice with two unticked boxes. Only then can an account be created, and the database enforces that order (D-014). Session cookies are httpOnly; `src/proxy.ts` refreshes the session and sends signed-out visitors to `/sign-in`.

## Continuous integration

Every pull request runs `.github/workflows/ci.yml`:

1. **quality**: lint, format check, typecheck, unit tests, build, `npm audit` of production dependencies
2. **e2e**: Playwright + axe on every route (unit tests also check that every migration name carries a module prefix, D-003), in light and dark themes, on desktop and a phone viewport
3. **lighthouse**: performance, accessibility, best practices and SEO must each be 95 or higher
4. **database**: Supabase Postgres starts, migrations apply, SQL lint, pgTAP
5. **secrets**: gitleaks

CodeQL runs on every pull request and weekly. Dependabot opens weekly update PRs.

## Production notes (for later phases)

- Create the Supabase project in **Mumbai (`ap-south-1`)**.
- Set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in the hosting provider's environment settings, never in Git.
- **Auth settings** to mirror `supabase/config.toml` in the Supabase dashboard:
  - Site URL and redirect URLs.
  - Email confirmations on, secure password change on, minimum password length 8, JWT expiry 600 seconds.
  - The four email templates and subjects from `supabase/templates/`, plus the three security notices (password changed, two-step on, two-step off).
  - MFA: authenticator app (TOTP) enroll and verify on.
  - Passkeys (beta): on, with the production domain as the relying party ID and origin. Then set `PASSKEYS_ENABLED=true` in the host.
  - Google provider with the production OAuth client. Name its Google Cloud OAuth consent screen **"Holy Auramaxing"** with a neutral logo: that name shows on Google's sign-in screen and in people's Google Account (privacy review 1).
- **Turnstile:**
  - Create a widget in Cloudflare.
  - Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the host.
  - Enable Turnstile with the secret key in Supabase (Authentication → Attack protection). Required, not optional: the 5-wrong-passwords lock-out lives in the app, and Turnstile is what slows down anyone calling Supabase Auth directly (security review 1).
- **Email, small launch without a domain (D-031): a dedicated Gmail account.**
  1. Create a Gmail account with a neutral name (the address appears as the sender). The app uses `holyauramaxing@gmail.com`. Turn on 2-Step Verification, then create an **app password** (Google account → Security → App passwords).
  2. Check it from your computer: put `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` and `SMTP_PASSWORD` in `.env.local`, then run `npm run email:test -- you@example.com`.
  3. In the host, set `EMAIL_PROVIDER=smtp` and the four `SMTP_*` values. That covers the app's own emails.
  4. In Supabase (Authentication → Emails → SMTP settings), turn on custom SMTP: host `smtp.gmail.com`, port `465`, the same username and app password, sender email = the Gmail address, sender name `Holy Auramaxing`. That covers Auth emails (confirmations, links, password and two-step notices). Then raise the email rate limit under Authentication → Rate limits; without custom SMTP it stays very low.
- **Email, later:** verify a sending domain in Resend, set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` (for example `Holy Auramaxing <hello@your-domain>`), and point Supabase's SMTP at Resend (`smtp.resend.com`).
- **Notifications (Phase 7c, D-092):**
  1. Generate a VAPID key pair once (`npx web-push generate-vapid-keys`) and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:holyauramaxing@gmail.com`) in the host. Keep the private key secret; changing it later means everyone turns push on again.
  2. Tell the hosted database where the sender is, once (SQL editor, or `supabase db query --linked`): `select public.notify_configure('https://<your-site>/api/notify/deliver', '<CRON_SECRET>');` The URL and secret are kept in Supabase Vault.
  3. Gmail sends about 500 emails a day: email is off by default except security alerts, and the digest keeps it small. Move to Resend with a domain before growing.
- **Account purge:** set `CRON_SECRET` (32+ random characters) in the host. `vercel.json` already asks Vercel Cron to call `/api/cron/account-purge` daily; on another host, schedule a daily GET with `Authorization: Bearer <CRON_SECRET>`.
- **Encryption key:** set `APP_ENCRYPTION_KEY` (32 random bytes, base64) in the host and keep a secure backup; see `.env.example`.
- **Upstash:** set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- **Visitor address for rate limits (D-052):** on Vercel alone, leave `TRUSTED_IP_HEADER` unset. With Cloudflare's proxy in front, set `TRUSTED_IP_HEADER=cf-connecting-ip`.
- **Security review 1:** see `docs/security-review-1.md` for findings, fixes and what was attacked.
- **Privacy review 1:** see `docs/privacy-review-1.md`. Email now goes from `holyauramaxing@gmail.com` (D-059). Before launch, choose a domain without "xxx" or the topic in it.
- **Before launch:** consider moving the grievance contact on `/privacy` (currently Paulz, a personal Gmail) to a dedicated address such as `privacy@<domain>`, and have all three policy pages reviewed by a lawyer.
