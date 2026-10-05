# Threat model (STRIDE)

Living document, updated every phase (CLAUDE.md §10). **Last updated:** Phase 2b (onboarding), 2026-10-05.

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

| Threat                     | Example                                     | Mitigation in place                                                                                                                                                                                                                                                                                   | Planned                                                       |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **S**poofing               | Account takeover                            | Supabase Auth; NIST passwords + breached-password check (D-017); per-IP and per-email rate limits with a 15-minute lock after 5 failures (D-019); Turnstile in production (D-018); refresh-token rotation with reuse detection; 10-minute access tokens; password reset signs out every other session | Two-factor, passkeys, sessions page, new-device alerts (2d)   |
| **T**ampering              | Forged theme or form posts                  | Theme values allow-listed (zod on the server, type guard on the client); Server Actions check the Origin header (CSRF)                                                                                                                                                                                | Zod on every server boundary                                  |
| **T**ampering              | Supply-chain compromise                     | Lockfile, `npm ci`, Dependabot, CodeQL, `npm audit` (production dependencies), GitHub Actions pinned to commit SHAs                                                                                                                                                                                   | OSV and ZAP baseline in Phase 11                              |
| **R**epudiation            | User or admin denies an action              | `audit_log`: sign-ups, sign-ins, failures, sign-outs, password changes; insert-only, unreadable through the API, kept 1 year, no IPs (D-016)                                                                                                                                                          | Role changes (3), admin actions (11)                          |
| **I**nformation disclosure | XSS stealing session data                   | Nonce CSP with `strict-dynamic`; no `unsafe-inline` or `unsafe-eval` for scripts; style attributes limited to two reviewed hashes; React escapes output by default                                                                                                                                    | DOMPurify only if rich text is ever added                     |
| **I**nformation disclosure | Shoulder-surfing via the tab title          | Tab titles use the neutral "Aura" (tested)                                                                                                                                                                                                                                                            | Discreet manifest, notifications and emails (Phases 7 and 10) |
| **I**nformation disclosure | Indexing of private pages                   | `noindex` on every app route (tested); the health endpoint reveals no configuration (tested)                                                                                                                                                                                                          | Sitemap and robots in Phase 9                                 |
| **I**nformation disclosure | Cross-group data leak                       | —                                                                                                                                                                                                                                                                                                     | Phase 3: RLS and an isolation test suite                      |
| **I**nformation disclosure | Leaking secrets                             | `.env*` ignored (except `.env.example`), gitleaks in CI, secret key never imported client-side                                                                                                                                                                                                        | —                                                             |
| **D**enial of service      | Floods on public endpoints                  | —                                                                                                                                                                                                                                                                                                     | Upstash rate limits, Cloudflare WAF                           |
| **E**levation of privilege | Reading or editing another person's profile | RLS owner-only on `profiles`, `privacy_settings`, `consents`; column-level grants (no self-service age, avatar or deletion changes); others read only through `profile_cards`; 34 pgTAP checks                                                                                                        | Group-scoped RLS (3)                                          |
| **E**levation of privilege | Clickjacking                                | `frame-ancestors 'none'`, `X-Frame-Options: DENY`                                                                                                                                                                                                                                                     | —                                                             |

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
