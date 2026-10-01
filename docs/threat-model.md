# Threat model (STRIDE)

Living document, updated every phase (CLAUDE.md §10). **Last updated:** Phase 1 (foundation), 2026-10-02.

## Scope in Phase 1

There are no accounts or user data yet. What exists: the public landing page, the app shell and its placeholder pages, `/dev/components`, `/api/health`, a theme cookie, and the Supabase wiring (clients only, no tables beyond the `util` helper).

## Assets (now and soon)

| Asset                             | Sensitivity                                   | Arrives |
| --------------------------------- | --------------------------------------------- | ------- |
| Check-ins, urges, triggers, notes | Special-category (sexual behaviour, religion) | Phase 4 |
| Journal entries                   | Special-category, author-only                 | Phase 8 |
| Group membership                  | Reveals faith and the struggle                | Phase 3 |
| Accounts, sessions, email         | Personal data                                 | Phase 2 |
| Theme preference cookie           | Not sensitive                                 | Phase 1 |

## Trust boundaries

Browser ⇄ Next.js (proxy, server components, server actions) ⇄ Supabase (Postgres with RLS, Auth, Storage). The publishable key is public. The secret key stays server-side only and isn't used yet.

## STRIDE

| Threat                     | Example                            | Mitigation in place                                                                                                                                                | Planned                                                                                         |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **S**poofing               | Account takeover                   | —                                                                                                                                                                  | Phase 2: Supabase Auth, MFA, Turnstile, rate limits, breached-password check, new-device alerts |
| **T**ampering              | Forged theme or form posts         | Theme values allow-listed (zod on the server, type guard on the client); Server Actions check the Origin header (CSRF)                                             | Zod on every server boundary                                                                    |
| **T**ampering              | Supply-chain compromise            | Lockfile, `npm ci`, Dependabot, CodeQL, `npm audit` (production dependencies), GitHub Actions pinned to commit SHAs                                                | OSV and ZAP baseline in Phase 11                                                                |
| **R**epudiation            | Admin denies an action             | —                                                                                                                                                                  | `audit_log` from Phase 2/3                                                                      |
| **I**nformation disclosure | XSS stealing session data          | Nonce CSP with `strict-dynamic`; no `unsafe-inline` or `unsafe-eval` for scripts; style attributes limited to two reviewed hashes; React escapes output by default | DOMPurify only if rich text is ever added                                                       |
| **I**nformation disclosure | Shoulder-surfing via the tab title | Tab titles use the neutral "Aura" (tested)                                                                                                                         | Discreet manifest, notifications and emails (Phases 7 and 10)                                   |
| **I**nformation disclosure | Indexing of private pages          | `noindex` on every app route (tested); the health endpoint reveals no configuration (tested)                                                                       | Sitemap and robots in Phase 9                                                                   |
| **I**nformation disclosure | Cross-group data leak              | —                                                                                                                                                                  | Phase 3: RLS and an isolation test suite                                                        |
| **I**nformation disclosure | Leaking secrets                    | `.env*` ignored (except `.env.example`), gitleaks in CI, secret key never imported client-side                                                                     | —                                                                                               |
| **D**enial of service      | Floods on public endpoints         | —                                                                                                                                                                  | Upstash rate limits, Cloudflare WAF                                                             |
| **E**levation of privilege | Member → admin                     | Deny by default (no tables yet)                                                                                                                                    | RLS plus server checks and pgTAP from Phase 2                                                   |
| **E**levation of privilege | Clickjacking                       | `frame-ancestors 'none'`, `X-Frame-Options: DENY`                                                                                                                  | —                                                                                               |

## Headers sent on every response

`Content-Security-Policy` (pages, per-request nonce), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (production), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-Frame-Options: DENY`, and no `X-Powered-By`.

## Open items

- `require-trusted-types-for 'script'` is not enabled yet; test Next.js and React compatibility in Phase 11.
- There is no CSP violation reporting endpoint yet; add it alongside Sentry (Phase 12).
- `security.txt` and the disclosure page come in Phase 11.
