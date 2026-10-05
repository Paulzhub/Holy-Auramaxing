# Holy Auramaxxxing

A grace-centred web app and installable PWA for daily check-ins, small-group challenges, accountability and Scripture. The full product spec is in [`CLAUDE.md`](CLAUDE.md), and the build is split into phases in [`PROMPTS.md`](PROMPTS.md).

**Status:** Phases 1, 2a and 2b are done. Phase 2c (profiles and photos) is in review; security settings and account deletion follow in 2d–2e.

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
3. Put it in `.env.local` as `GOOGLE_CLOUD_VISION_API_KEY=…`. Never commit it.

A production build with no key keeps every new photo unpublished (D-026).

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
- `/home`: the app shell (Home, Groups, Check in, Alerts, Me, Settings). You need to be signed in.
- `/privacy`, `/terms`, `/your-data`: draft policies (waiting for legal review)
- `/dev/components`: every component in every state. It's on automatically in `npm run dev`; in a production build it needs `ENABLE_DEV_PAGES=true`.
- `/api/health`: shows whether Supabase is configured and reachable
- Supabase Studio: <http://127.0.0.1:54323>

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
| `npm run db:types`                           | Regenerate `src/lib/supabase/database.types.ts` from the local database after a migration (CI checks it's current).                                                                                                  |
| `npm run check`                              | Lint + format + typecheck + unit tests + build: what CI's first job runs                                                                                                                                             |
| `npx supabase db reset`                      | Rebuild the local database from `supabase/migrations`                                                                                                                                                                |
| `npx supabase migration new <module>_<what>` | Create a new migration (see naming below)                                                                                                                                                                            |

## Project layout

```
src/
  app/[locale]/(public)/     public pages (landing for now)
  app/[locale]/(app)/        the signed-in app: shell + placeholder pages
  app/[locale]/(app)/dev/    the component gallery
  components/ui/             design-system components
  components/shell/          app shell: navigation, theme switcher, brand
  features/<module>/         one folder per module (auth, groups, checkins, …);
                             other code imports a module only via its index.ts
  i18n/                      next-intl routing and request config
  lib/                       security (CSP, headers), theme, Supabase clients, env
  styles/                    tokens.css (design tokens), components.css, shell.css
  proxy.ts                   per-request CSP nonce + locale routing
messages/en.json             every user-facing string
supabase/migrations/         versioned SQL, named <timestamp>_<module>_<what>.sql
supabase/tests/database/     pgTAP tests
tests/e2e/                   Playwright specs (axe, keyboard, theme, headers, shell)
docs/                        decisions, threat model, design system
```

## How things work

- **Theme.** Light, dark or system, set from the switcher in the header, sidebar or Settings. Your choice is saved in a `theme` cookie, so the server sends the right colours in the very first HTML; there's nothing to flash. A tiny inline script, allowed by the CSP nonce, covers the case where the cookie is missing but the local cache has your choice. With JavaScript turned off, the switcher still works through a Server Action.
- **Strings.** All user-facing text lives in `messages/en.json`. ESLint fails on hard-coded text in JSX, and a unit test checks that every message parses. Browser tab titles use the neutral short name "Aura".
- **Security headers.** `src/proxy.ts` sends a strict, nonce-based Content-Security-Policy on every page. `next.config.ts` adds HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, COOP/CORP and `X-Frame-Options`. See `docs/threat-model.md`.
- **Module boundaries.** ESLint stops one module from importing another module's internals. Each module has two public entry points: `@/features/x` (server functions and server components) and `@/features/x/ui` (client components). They are separate so that server helpers never pull client code into a page (docs/decisions.md D-023).
- **Accounts.** Sign-up asks "Are you 18 or older?", then shows a plain-language consent notice with two unticked boxes. Only then can an account be created, and the database enforces that order (D-014). Session cookies are httpOnly; `src/proxy.ts` refreshes the session and sends signed-out visitors to `/sign-in`.

## Continuous integration

Every pull request runs `.github/workflows/ci.yml`:

1. **quality**: lint, format check, typecheck, unit tests, build, `npm audit` of production dependencies
2. **e2e**: Playwright + axe on every route, in light and dark themes, on desktop and a phone viewport
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
  - The four email templates and subjects from `supabase/templates/`.
  - Google provider with the production OAuth client.
- **Turnstile:**
  - Create a widget in Cloudflare.
  - Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the host.
  - Enable Turnstile with the secret key in Supabase (Authentication → Attack protection).
- **Email:** connect a real SMTP sender (Resend) with the sender name "Aura".
- **Encryption key:** set `APP_ENCRYPTION_KEY` (32 random bytes, base64) in the host and keep a secure backup; see `.env.example`.
- **Upstash:** set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- **Before launch:** consider moving the grievance contact on `/privacy` (currently Paulz, a personal Gmail) to a dedicated address such as `privacy@<domain>`, and have all three policy pages reviewed by a lawyer.
