# Holy Auramaxing — Project Spec (Master Prompt)

> App: Holy Auramaxing (one spelling in everything people see, D-059; the repo, folders and Supabase project id keep the old "holy-auramaxxxing"). Domain: not chosen yet (set `NEXT_PUBLIC_SITE_URL`). Supabase region: Mumbai (`ap-south-1`). AI coding tools re-read this file every session. Run the phase prompts in `PROMPTS.md` one at a time.

## 1. Your role and the mission

You are the lead engineer, product designer and security reviewer for **Holy Auramaxing**: a Christian, grace-centred web app and installable PWA that helps people break free from pornography, masturbation and compulsive sexual behaviour through daily check-ins, group challenges, accountability and Scripture. It launches for a small group of friends and must be able to grow to millions of users without a rewrite.

We build in phases. For each phase: plan first and list the files you will touch, wait for my OK, implement, write tests, run them, then finish with a summary of what changed, how I can verify it, and known gaps.

## 2. Product principles (apply to every decision)

1. **Grace, not shame.** No copy, colour or flow shames a relapse. A slip resets a streak, never a person. Lead with forgiveness and new mercies (1 John 1:9, Lamentations 3:22–23, Romans 8:1).
2. **Honesty is rewarded.** Logging a slip earns the same check-in XP as logging a clean day. Nothing may make lying more rewarding than telling the truth. A missed day costs the same as a reported slip, so staying silent never beats telling the truth.
3. **Private and discreet by default.** Nothing is public unless the user turns it on. Notification text, the home-screen name, emails and browser tab titles never reveal the topic.
4. **Groups are isolated.** Data from one group never appears in another. A user sees only groups they belong to.
5. **Not a medical product.** Never claim to diagnose, treat or cure. Point to pastors, counsellors and crisis lines.
6. **Fast and light.** Works on a cheap Android phone on a slow connection. Heavy 3D lives only on marketing pages.
7. **Accessible to everyone.** WCAG 2.2 AA is a requirement, not a polish step.

## 3. Users and roles

| Role | Scope | Can |
| --- | --- | --- |
| Visitor | Public site | Read public pages, sign up |
| Member | One group | Check in, react, nudge, post, view leaderboard |
| Group admin | One group | Approve and remove members, moderate posts, manage invites |
| Group owner | One group | Everything an admin can, plus edit challenge settings, transfer ownership, archive the group |
| Accountability partner | A pair inside a group, mutual opt-in | See the partner's full check-in detail and SOS alerts |
| Platform admin | Whole platform | Report queue, suspensions, feature flags, announcements; never journals or private notes |

## 4. Tech stack

- **Framework:** Next.js (latest stable, App Router, Server Components), TypeScript in strict mode.
- **UI:** Tailwind CSS with design tokens as CSS variables; Radix UI primitives (or shadcn/ui) for accessible components.
- **Backend:** Supabase — Postgres, Auth, Storage, Realtime, Edge Functions, Queues (pgmq) and Cron. Row-level security (RLS) on every table.
- **Validation:** Zod at every server boundary; generated database types.
- **Motion and 3D:** GSAP with ScrollTrigger and SplitText (free for commercial use since v3.13), Lenis smooth scroll, three.js via React Three Fiber and drei, custom GLSL shaders, Motion for small UI transitions, canvas-confetti for celebrations, the View Transitions API where supported.
- **PWA:** service worker (Serwist or hand-written), Web App Manifest, Web Push with VAPID keys, Badging API.
- **Email:** Resend or Amazon SES with React Email templates.
- **i18n:** next-intl; all copy in message files from day one.
- **Security tooling:** Upstash rate limiting, Cloudflare Turnstile on auth forms, Cloudflare in front for DNS, WAF and DDoS protection.
- **Observability:** Sentry with PII scrubbing, uptime monitoring, structured logs.
- **Testing:** Vitest, Playwright, axe-core, pgTAP for RLS, Lighthouse CI, k6 for load.
- **CI/CD:** GitHub Actions, preview deploys per pull request, Dependabot, CodeQL, secret scanning.
- **Hosting:** Vercel (or Cloudflare) plus Supabase in Mumbai (`ap-south-1`).
- Do not use Google Sheets, Firebase Realtime Database or browser storage as a system of record.

## 5. Architecture

- **Modular monolith:** one Next.js app organised by feature module (`features/auth`, `groups`, `checkins`, `gamification`, `social`, `notifications`, `recovery`, `profile`, `admin`). Each module owns its UI, server logic, migrations and tests, and other modules call it through typed service functions, never by touching its tables. Any module can later become its own service.
- **Writes go through server code** (server actions, route handlers or Postgres functions). Clients read through RLS-protected queries.
- **Slow or fan-out work goes through a job queue:** notifications, emails, leaderboard and stats updates, badge awards, image processing. Never inline in a request.
- **Time:** store every timestamp in UTC; every user has an IANA time zone; "a day" is computed in the user's own time zone.
- **IDs** are UUIDv7. Soft-delete (`deleted_at`) where history matters; hard-delete on account erasure.
- **Migrations** are versioned SQL files in the repo; never change the production schema by hand.

## 6. Data model and multi-tenancy

Tenancy model: one database, one schema, a `group_id` on every group-scoped row, enforced by Postgres RLS. A user is global; membership is per group; a user can belong to many groups at once.

Core tables (add columns as needed; keep these names):

- `profiles` — id (auth user id), handle (unique), display_name, avatar_path, bio, testimony, favourite_verse, timezone, locale, theme_pref, adult_confirmed_at, created_at, deleted_at
- `privacy_settings` — user_id, profile_visibility (groups / partners / nobody), plus per-field visibility for bio, testimony and favourite verse
- `groups` — id, name, slug, description, cover_path, owner_id, challenge_type (30 / 40 / 60 / 90 / custom / ongoing), start_date, end_date, group_timezone, covenant_text, min_share_level (checkin_only / streak / full), leaderboard_hiding_allowed, join_policy (invite_only / request_to_join), max_members, archived_at
- `group_members` — group_id, user_id, role (owner / admin / member), status (active / pending / removed; leaving deletes the row, D-038), share_level (checkin_only / streak / full), joined_at; unique (group_id, user_id)
- `group_invites` — id, group_id, token_hash, code_hash, created_by, expires_at, max_uses, use_count, revoked_at
- `group_covenant_proposals`, `group_covenant_agreements` — a tighter covenant waiting for every member's agreement (D-039)
- `checkins` — id, user_id, local_date, outcome (clean / slipped), mood (1–5), urge_level (0–5), triggers (from a fixed list), note_encrypted, created_at; unique (user_id, local_date)
- `user_stats` — user_id, current_streak, longest_streak, total_clean_days, checkin_streak, last_checkin_date, xp, level, level_progress_days, highest_level
- `group_member_stats` — group_id, user_id, clean_days_in_challenge, checkins_in_challenge, xp_in_group
- `xp_ledger` — append-only: id, user_id, group_id (nullable), reason, points, created_at
- `badges`, `user_badges`, `level_tiers` (tier, era, name, verse; seeded from `data/levels.json`)
- `posts` — id, group_id, author_id, kind (encouragement / prayer_request / testimony / announcement), body, pinned, created_at, edited_at, deleted_at
- `comments` — id, post_id, group_id, author_id, body
- `reactions` — id, group_id, user_id, target_type, target_id, kind (pray / heart / fire / strong / dove); unique per user, target and kind
- `nudges` — id, group_id, from_user, to_user, kind, created_at
- `partnerships` — id, group_id, user_a, user_b, status (pending / active / ended), permissions
- `notifications` — id, user_id, type, group_id, actor_id, data, read_at, created_at
- `notification_preferences` — user_id, type, channel (in_app / push / email), enabled; plus quiet hours, digest mode, discreet mode and per-group mutes
- `push_subscriptions` — id, user_id, endpoint, p256dh, auth, user_agent, last_used_at
- `journal_entries` — id, user_id, body_encrypted, created_at
- `devotionals`, `devotional_progress`, `reports`, `blocks`, `audit_log`, `consents` (what was agreed, policy version, timestamp)

RLS rules, each with a pgTAP test:

- A user reads a group-scoped row only if they are an active member of that group.
- A user sees another member's check-ins only through a security-definer view that applies that member's share level for that group: checkin_only shows "checked in today: yes/no"; streak adds the current streak; full adds the outcome; an active partner also sees mood and triggers.
- A user writes only their own check-ins, reactions, posts, comments and nudges.
- Owners and admins manage only their own group.
- `journal_entries` and check-in notes are readable only by their author.
- The anonymous role reads only published content (devotionals, blog).

Indexes lead with `group_id` on group-scoped tables; `(user_id, local_date)` on check-ins; `(user_id, read_at, created_at)` on notifications. Plan monthly partitioning for `checkins`, `notifications` and `xp_ledger` once they pass about 10 million rows.

## 7. Features

### 7.1 Sign-up, login and accounts

- Google sign-in and email + password, both through Supabase Auth. Link both methods to one account when the verified emails match. Magic-link login as an alternative.
- Email verification before joining any group. Passwords per NIST SP 800-63B: at least 8 characters (encourage 12+), no composition rules, checked against known-breached passwords (Have I Been Pwned range API), paste and password managers allowed.
- Optional two-factor (authenticator app; passkeys where supported). Required for platform admins.
- Age gate at sign-up: users confirm they are 18 or older; under-18s see a kind message and resources, and no account is created.
- Consent screen: plain-language summary of what is collected (check-ins are sensitive; using the app reveals faith), an unticked opt-in box, links to privacy policy and terms. Store the policy version and timestamp in `consents`.
- Sessions in secure, httpOnly, SameSite cookies with refresh-token rotation. A "devices and sessions" page with sign-out-everywhere. Email alert on a new-device login.
- Self-serve data export (JSON and CSV) and account deletion with a 14-day grace period, then hard deletion of personal data and anonymisation of group contributions.

### 7.2 Onboarding

Three or four skippable screens: welcome (a grace message and a verse), an optional private "my why", daily reminder time and time zone, discreet mode, then create a group or join one from an invite link.

### 7.3 Profile

- Avatar upload: JPG, PNG, WebP or HEIC up to 5 MB; square crop and compression on the device; the server checks magic bytes, re-encodes to WebP/AVIF in three sizes, strips EXIF and GPS data, renames files randomly and screens images for nudity before they show. Default avatar: generated initials.
- Display name, unique handle, bio (280 characters max), optional testimony (2,000 max), favourite verse, joined date, level, a showcase of up to six badges.
- Per-field privacy controls. Profiles are visible only to people who share a group; never public, never indexed.

### 7.4 Groups (isolated, multi-tenant challenges)

- Any verified user can create a group: name, description, cover image, challenge type (30, 40, 60 or 90 days, custom length, or ongoing), start date, group time zone, member cap (default 50), join policy, and a short covenant members accept on joining. The covenant includes the group's accountability level: the minimum share level every member gives the group, and whether members may hide from the leaderboard. Both are shown before someone joins, and a member may share more than the minimum but never less. Once others have joined, the owner may relax the covenant at any time, but tightening it (a higher minimum, no hiding, or new words) needs every member's agreement.
- Invite by link, short code or QR code. Links expire (default 7 days), can have a use limit, and can be revoked and regenerated. Tokens are at least 128-bit random and stored hashed. The invite page is `noindex` and shows only the group name and member count.
- A user can join many groups; a group switcher in the header lists them with unread counts.
- Owners and admins edit the group's name, description and picture; admins approve requests, remove members and manage invites. Owners promote, demote and remove members, transfer ownership, archive or delete the group. Members can leave at any time.
- Group home: "Day 23 of 90", members' check-in status for today (per share level), leaderboard, encouragement wall, prayer requests, group totals ("together: 1,240 clean days"), upcoming milestones.
- Lifecycle: scheduled, active, completed (celebration screen, shareable certificate image, "start a new round"), archived.
- Isolation test: a member of group A gets zero rows from group B on every endpoint.

### 7.5 Daily check-in and streaks

- One check-in per user per local day, counted in all their groups. One large tap target each: "I stayed free today" and "I slipped". Optional: mood (1–5), urge strength (0–5), triggers (bored, lonely, stressed, tired, late night, alone with phone, social media, other), private encrypted note.
- Window: today, plus yesterday until 12:00 local time. No other backfilling, except offline check-ins (below). Edits allowed inside the window and recorded in `audit_log`.
- **Offline check-ins (owner, 2026-10-10):** someone without internet can still check in. The device saves the answer with the local date and the time it was made, and sends it automatically when the connection returns. It counts for the day it was made, even if it arrives after that day's window has closed, and the level, streaks and group stats recalculate. Because the device's clock can be changed, the server accepts an offline check-in only if it was made inside its window by the device's record, arrives within a set limit (`OFFLINE_SYNC_MAX_DAYS`: 7 days, owner 2026-10-10; a database config value, D-067), and is not older than the account; each one is marked as synced late in `audit_log`.
- Streak = consecutive clean days. A slip resets the current streak only; longest streak, total clean days and the check-in streak stay.
- Slip flow: a compassionate full-screen message, a forgiveness verse, an optional "what led to it?" reflection, an option to ask a partner or the group for prayer, and one suggested next step. No red alarms, no failure language.
- A missed day shows as "no check-in", never as a slip, but costs the same 10 levels as a slip (§7.6).
- Private streak calendar and simple charts of mood, urges and triggers with plain insights ("most urges: weeknights after 11 pm").
- Daily reminder at the user's chosen time; an evening "streak at risk" reminder if they haven't checked in.

### 7.6 Gamification

- **XP** from an append-only ledger, with values in a config table so they can be tuned: any honest check-in +10 (no extra XP for a clean day: owner, 2026-10-10, because it would make "stayed free" pay more than an honest slip and reveal a quiet member's slip on the Consistency board); check-in streak bonus +2 per day up to +20; encouraging others (reaction, nudge, comment) +1 each up to +10 a day; devotional read +5; finishing a group challenge +100. XP powers the Consistency leaderboard and never affects levels.
- **Levels** (every name, era and verse is in `data/levels.json` and `data/levels.csv`):
    - Everyone starts at Level 0, "Clay".
    - Each clean check-in adds one day to a level progress bar. Levels 1–20 need 5 clean days each (Level 20 on day 100); every level after 20 needs 10 clean days (Level 21 on day 110, Level 1000 on day 9,900).
    - **Relapse rule:** each reported slip drops the user 10 levels, at every level, never below Level 0, and empties the progress bar. Keep the 10 as a config value (`RELAPSE_LEVEL_PENALTY`).
    - **Missed-day rule (owner, 2026-10-10):** each missed day costs exactly the same as a slip: 10 levels, never below Level 0, and the progress bar empties. It applies to every day without a check-in once that day's window has closed (yesterday becomes missed at 12:00 local time), so a week with no check-ins costs 70 levels. Days before the account existed never count, and neither do days whose window closed while the account was closing for deletion (owner, 2026-10-10, D-066). A missed day is still shown as "No check-in", never as a slip. If an offline check-in for that day syncs later (§7.5), the replay recalculates and the penalty disappears. This closes the gap where skipping a check-in was safer than reporting a slip.
    - Names: Level 0 is "Clay". From Level 1, each tier name covers six levels with these suffixes in order: none, Lite, Pro, Max, Ultra, Ultra Pro Max. Tier = floor((level − 1) / 6) + 1; suffix = (level − 1) mod 6. Level 1 "Breath of Life", Level 2 "Breath of Life Lite", Level 6 "Breath of Life Ultra Pro Max", Level 7 "Ark Builder", Level 1000 "Well Done Max".
    - The 167 tier names follow the Bible from Genesis to Revelation in 11 eras. The level card shows name, era, verse and progress ("3 of 10 days to Ark Builder Max"); entering a new era gets its own celebration.
    - Past Level 1002, the end of the named tiers, labels continue as "Well Done 2", "Well Done 2 Lite" and so on until new names are added to `level_tiers`.
    - Store `level`, `level_progress_days` and `highest_level` in `user_stats`, computed by a Postgres function that replays the user's check-ins in date order, so an edit inside the check-in window or a late offline check-in recalculates correctly. Because missed days cost levels even when the person never opens the app, the level is read "live" like the streaks (D-043): the stored level minus 10 for each missed day since the last check-in whose window has closed, never below 0. `data/build_levels.py` holds a reference implementation (`replay`) with tests; the Postgres function must give identical results.
    - Level-up: animation, verse card, optional share card. Level-down after a slip or missed days: one quiet, grace-filled line ("You're now Ark Builder Pro. Your longest streak and total free days are still yours."), never notified to anyone else. The share card shows only the level's name, era, verse reference and the app's name, and isn't offered for levels whose name gives the topic away (D-065).
    - Privacy: a group sees a member's level only when their share level there is streak or full, because a 10-level drop would otherwise reveal a slip.
- **Badges:** clean-day milestones at 1, 3, 7, 14, 21, 30, 40, 60, 90, 180 and 365; check-in consistency at 7, 30 and 100 days; Encourager; Prayer Warrior; Faithful Finisher; First Testimony. Each has an icon, a verse and one line of description.
- **Leaderboards** per group only (no global board at launch). Tabs: Consistency XP (default), Level, Current streak, Clean days this challenge, Encourager. Ties go to whoever got there first. Members can hide from the leaderboard only if the group owner allows it (part of the covenant). This-week and all-time views. The Current streak and Clean days tabs stay (owner, 2026-10-10): the app exists for freedom through accountability, not for hiding.
- **Group goals:** a shared target ("500 clean days together this month") with a group progress bar.

### 7.7 Social and encouragement

- Reactions (pray, heart, fire, strong, dove) on shared check-ins, milestones, posts and comments.
- Nudges: "Praying for you", "Check in today", "You've got this", "Call me if you need". One per sender per recipient per day; recipients can mute nudges.
- Encouragement wall per group: short posts, prayer requests with an "I prayed" counter, testimonies, pinned owner announcements; one level of comments; edit or delete your own; report; block.
- Accountability partners: request and accept inside a group; partners see full check-in detail and, if allowed, get an alert when the other misses two days or presses SOS.
- Milestone moments: when a member hits a milestone, the group gets a celebration card to react to.
- Sunday recap: your week, your group's week, a verse; in-app and optional email.

### 7.8 Notifications

- Channels: in-app (bell with unread count, notification centre, toasts), Web Push and email. In-app is always on; push and email are toggled per type.
- Types: daily reminder; streak at risk; nudge received; reaction received; comment or reply; new prayer request in my group; someone prayed for my request; member joined; join request (admins); milestone (mine or a group member's); level up; badge earned; challenge starting or ending; partner request; partner SOS; partner missed check-ins; weekly recap; group announcement; security alerts (new login, password change), which cannot be turned off.
- Settings: a grid of types by channel; per-group mute; quiet hours (default 22:00–07:00 local, except partner SOS); digest mode that bundles non-urgent items into one daily or weekly push; "snooze everything" for a day or a week.
- Discreet mode, on by default: push and email text never mentions pornography, lust, relapse or streak counts ("You have a new message from your group", not "Day 30 clean!"). Neutral sender name and subjects.
- Alerts: realtime in-app updates via Supabase Realtime; app-icon badge count; optional sound and vibration. Ask for push permission only after the first check-in, with an explanation screen first. On iOS, show how to add to the Home Screen first, because Web Push there works only for installed web apps (iOS 16.4+).
- Pipeline: event, then a `notifications` row, then a queue job, then a per-channel sender that checks preferences, quiet hours, rate limits and duplicates and logs the result. Remove push subscriptions that return 404 or 410. Fan-out to a group of thousands must never block a request.

### 7.9 Recovery tools

- SOS button one tap away on every screen: a 60-second guided breathing animation, rotating Scripture cards (1 Corinthians 10:13, James 4:7, Philippians 4:8, Psalm 119:9–11, Galatians 5:16), a short prayer, a 10-minute "ride the wave" urge timer, quick actions (call my partner, ask my group to pray, go for a walk), and a private tally of urges resisted.
- Private journal with guided prompts; encrypted; visible to no one else.
- Devotionals: verse of the day; 7-, 30- and 90-day reading plans stored in the database; progress tracking.
- Resources page: setting up content filters and DNS blocking, finding a counsellor, books, and crisis lines by country (India: Tele-MANAS 14416; US: 988; others via findahelpline.com). If journal or post text contains self-harm language, gently show crisis resources (matched on the device; nothing is sent).

### 7.10 Settings

Theme (light, dark, system), language, time zone, reminder time, notifications, privacy, discreet mode, app lock (PIN or device biometrics, auto-lock after a set time), connected accounts, password and two-factor, sessions, data export, delete account.

### 7.11 Moderation and admin

- Report content or users; block users (blocked users cannot see or interact with you).
- Group admins moderate their own group. Platform admins get a report queue, content removal, suspensions, group closure, announcements and feature flags.
- Automatic filter for slurs and explicit links in posts; image screening on uploads; zero tolerance for sexual content; a written procedure for reporting child sexual abuse material to the authorities (NCMEC in the US, cybercrime.gov.in in India).
- Every admin action goes to `audit_log`. Admins can never read journals or private notes.

## 8. Design system, motion and 3D

- **Direction: "light breaking through."** A calm dawn palette with warm gold accents; deep indigo night for dark mode; soft rounded shapes; a distinctive serif for display headings and a highly legible sans for UI. No stock photos of sad people; no sexualised imagery anywhere.
- **Tokens:** colour, type scale, spacing, radius, shadow and motion (durations, easings) as CSS variables for light and dark. Every colour pair is contrast-checked.
- **Theme toggle:** light, dark or system, in the header and in settings; applied before first paint by a tiny inline script (no flash); saved to the profile and a local cache.
- **Marketing pages** tell a scroll story, "From chains to freedom": a three.js hero (React Three Fiber) where chain links break apart on scroll and dissolve into rising particles of light, over a custom GLSL shader of soft dawn light. GSAP ScrollTrigger for pinned scenes, SplitText for headline reveals, Lenis for smooth scrolling, View Transitions between pages.
- **Inside the app**, motion stays restrained: check-in press feedback, a streak ring that fills, level-up and milestone confetti, smooth list transitions. No WebGL in the app shell.
- **Motion performance:** load three.js and shaders after the largest paint via dynamic import; render only while on screen; cap device pixel ratio at 2; fall back to a static image or CSS gradient when WebGL is missing, device memory is 2 GB or less, Save-Data is on, or reduced motion is requested; animate only transform and opacity; keep main-thread tasks under 50 ms.
- **Reduced motion:** turn off smooth scroll, parallax, 3D and confetti; use simple fades instead.
- **Components:** button, input, card, dialog, bottom sheet, tabs, toast, avatar, progress ring, streak calendar, leaderboard row, reaction bar, empty state, skeleton loader. Each documented with default, hover, focus, active, disabled, loading and error states.
- **Layout:** mobile-first; breakpoints at 360, 768, 1024 and 1440 px; bottom navigation on mobile (Home, Groups, Check in, Alerts, Me) and a sidebar on desktop; the SOS button always visible.

## 9. Accessibility (WCAG 2.2 AA)

- Semantic landmarks, logical headings, a skip link. Everything works by keyboard, with a visible focus ring that sticky headers never cover.
- Contrast at least 4.5:1 for text and 3:1 for large text and UI parts, in both themes.
- Touch targets at least 24 × 24 px (aim for 44 × 44). No drag-only interactions. No time limits.
- Accessible login: no puzzles; paste and password managers allowed; passkeys supported.
- Forms: visible labels, autocomplete attributes, inline errors announced to screen readers, an error summary.
- Live regions announce toasts, new notifications and check-in confirmation. Dialogs trap focus and return it.
- Alt text on all images; decorative 3D canvases are `aria-hidden` and have a text equivalent.
- Works at 200% zoom and at 320 px width without sideways scrolling; honours reduced motion, increased contrast and forced colours.
- Help sits in the same place on every page; never ask for the same information twice.
- Testing: axe-core in Playwright on every page in CI (zero violations), a manual keyboard pass, and screen-reader passes with NVDA, VoiceOver and TalkBack. Publish an accessibility statement.

## 10. Security (target: OWASP ASVS 5.0 Level 2)

- Keep a STRIDE threat model in `docs/threat-model.md`, updated every phase. Top risks: cross-group data leaks, account takeover, exposure of check-in or journal data, invite-link abuse, notification spam, malicious uploads, XSS through bios and posts.
- Check authorisation on the server for every request and again through RLS. Deny by default. The Supabase service-role key never reaches client code.
- Validate all input with Zod; parameterised queries only; render user content as text (sanitise with DOMPurify if rich text is ever added); length limits everywhere.
- Headers: strict Content-Security-Policy with nonces, HSTS with preload, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, `frame-ancestors 'none'`. Aim for A+ on Mozilla Observatory.
- CSRF protection on every state-changing request.
- Rate limits on login, sign-up, password reset, invite joins, nudges, posts, reactions and uploads; progressive delays; Turnstile on auth forms.
- Uploads as in 7.3, plus an allow-list of types, a separate storage domain, and no SVG uploads.
- TLS everywhere; encryption at rest; application-level AES-256-GCM encryption (keys in Supabase Vault or a KMS) for journal entries and check-in notes. Secrets live only in environment variables, never in Git.
- Supply chain: committed lockfile, Dependabot, `npm audit`/OSV in CI, CodeQL or Semgrep, an OWASP ZAP baseline scan against preview deploys, gitleaks, pinned GitHub Actions.
- Log security events (logins, failures, role changes, admin actions, exports, deletions) to `audit_log`. Never log tokens or sensitive content.
- Daily backups with point-in-time recovery; a documented restore drill every quarter.
- An incident-response plan in `docs/incident-response.md`, including breach notification to regulators and affected users.
- Publish `/.well-known/security.txt` and a responsible-disclosure page.

## 11. Privacy and compliance

- Treat check-ins, urges, triggers, notes, journals and even group membership as **sensitive personal data**: they reveal sexual behaviour and religious belief (special-category data under GDPR Article 9; sensitive data under California's CPRA; possibly consumer health data under laws like Washington's My Health My Data Act).
- **India, DPDP Act 2023 and DPDP Rules 2025** (full obligations apply from 13 May 2027; build to them now): an itemised, plain-language consent notice (English, with Hindi as an option); withdrawal as easy as giving consent; purpose limitation and data minimisation; rights to access, correct, erase and nominate; a named grievance contact with a response time; retention limits; breach notification; verifiable parental consent and no tracking of children, which is why we launch 18+ only.
- **EU/UK users:** explicit consent for Article 9 data, a data protection impact assessment before launch, records of processing, data processing agreements with every vendor, transfer safeguards.
- **US:** under-13s are already blocked by the 18+ rule (COPPA); honour CPRA notice and sensitive-data limits by design.
- **UK Online Safety Act:** if offered in the UK, complete the illegal-content risk assessment and keep reporting tools in place.
- **Privacy by design:** collect the minimum; no third-party trackers, ad pixels or fingerprinting; cookieless analytics; essential cookies only; never sell or share data; never train AI on user content.
- **Pages:** Privacy Policy, Terms, Community Guidelines, Accessibility Statement, Security, and a plain-language "Your data" page. Mark them as drafts pending legal review.
- **No health claims:** never claim to treat or cure addiction; state that the app is not a substitute for professional help.
- **Retention defaults:** notifications 90 days; dead push subscriptions removed immediately; audit logs 1 year; deleted accounts purged after the 14-day grace period and backup rotation.

## 12. SEO and GEO (generative engine optimisation)

- **Indexable:** landing, how it works, about and statement of faith, FAQ, blog and resources hub, Scripture guides, devotional previews, legal pages. **Not indexable:** everything behind login, invite pages and profiles (`noindex`, left out of the sitemap, auth-gated).
- Public pages are static or server-rendered HTML, readable without JavaScript (most AI crawlers do not run it).
- Unique titles and meta descriptions, canonical URLs, Open Graph and Twitter cards with generated images, `hreflang` once translations exist, XML sitemap, robots.txt, breadcrumbs.
- JSON-LD: Organization, WebSite, WebApplication, Article/BlogPosting with author, FAQPage, BreadcrumbList.
- Content: answer-first articles for real questions ("How do I quit porn as a Christian?", "What does the Bible say about lust?", "How do I help a friend who is struggling?"). Each opens with a two- or three-sentence direct answer, uses question-style H2s, cites Scripture and research, shows author and reviewer (pastor or counsellor) bios, and carries an updated date.
- GEO: allow reputable AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) on public pages only; publish `/llms.txt` summarising the site; keep the name and description identical across the site, social profiles and directories; quotable statistics with sources; stable URLs.
- Core Web Vitals at the 75th percentile on mobile: LCP under 2.5 s, INP under 200 ms, CLS under 0.1. Lighthouse 95+ in every category on public pages.

## 13. PWA

- Manifest: a discreet `name` and `short_name`, maskable and monochrome icons (192 and 512 px), theme colours, `display: standalone`, an `id`, shortcuts (Check in, SOS) and screenshots for the richer install sheet.
- Service worker: precache the app shell; network-first for data with a stale fallback; cache-first for static assets; an offline page; offline check-ins queued in IndexedDB with the local date and time they were made, and synced exactly once by Background Sync (or on next open). The server accepts them for the day they were made, within `OFFLINE_SYNC_MAX_DAYS` (§7.5), even after the normal window has closed. A "new version available" refresh prompt.
- Install UX: a custom prompt after the first check-in; an iOS sheet showing Share, then Add to Home Screen.
- Web Push with VAPID keys; app-icon badges for unread counts; Web Share for invite links; QR codes for invites.
- Keep the code ready for later Trusted Web Activity (Google Play) and Capacitor (App Store) wrappers.

## 14. Performance and scalability

- Budgets: under 170 KB of compressed JavaScript on first load of app routes; AVIF/WebP responsive images; self-hosted, subset fonts with `font-display: swap`.
- Stateless app servers; public pages cached at the CDN; personal data never cached publicly.
- Database: connection pooling; an index for every hot query (include `EXPLAIN` output in pull requests); cursor pagination, never OFFSET; counters updated incrementally instead of `COUNT(*)`; leaderboard tables refreshed by jobs; read replicas and monthly partitions when needed.
- Jobs are idempotent with retries and a dead-letter queue. Reminder jobs run every 15 minutes and pick users whose local time matches.
- At large scale, move leaderboards to Redis sorted sets keyed by group; subscribe to Realtime per group channel only.
- Feature flags for gradual rollout, with kill switches for expensive features (3D, realtime).
- Monitor errors, p95 latency per route, queue depth, slow queries and monthly cost.
- Load-test with k6 before each launch milestone: 1,000 concurrent users for the friends launch; design for 100,000 daily active users without schema changes.

## 15. Rules for you while building

- Ask before adding a dependency not listed here, changing the data model, or departing from this spec. Record each decision in `docs/decisions.md`.
- Small, reviewable changes: one feature per branch and pull request, conventional commit messages.
- TypeScript strict, no `any`; ESLint and Prettier clean; no stray console logs.
- Every feature ships with tests: unit (Vitest), RLS (pgTAP), end-to-end and accessibility (Playwright + axe). CI must be green.
- Never commit secrets; keep `.env.example` current. Keep `README.md` and `docs/` current.
- All user-facing text goes through the i18n files and is warm, hopeful, short and free of shame.
- When unsure, choose the more private, more accessible, more secure option, and tell me you did.
- End every phase with: what changed, how to test it by hand, known gaps, and what the next phase needs.

---

Next.js agent rules: @AGENTS.md
