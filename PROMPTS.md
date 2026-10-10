# Holy Auramaxing — Phase Prompts

How to use:

1. Keep `CLAUDE.md` (the master spec) at the root of the project. Your AI coding tool reads it every session.
2. Paste ONE phase prompt at a time, in order. Ask for a plan first, read it, then let it build.
3. Check every "Done when" item yourself before moving on. Commit to Git after each phase.
4. Run the review prompts (bottom of this file) in a fresh session after phases 4, 7 and 11, and before launch.

Phases 1–7 give you a usable app for your friends; 8–12 make it ready for the public.

---

## Phase 1 — Foundation and design system

```text
Read CLAUDE.md fully. We are starting Phase 1: Foundation and design system. Plan first, then wait for my OK.

Build:
- Next.js + TypeScript (strict) project with the module structure from section 5, ESLint, Prettier, Vitest, Playwright with axe, and GitHub Actions CI (lint, typecheck, test, build).
- Supabase wiring with local development through the Supabase CLI, .env.example, and a migrations folder.
- Design tokens from section 8 for light and dark, the no-flash theme toggle, self-hosted fonts.
- The core components from section 8 with all their states, plus a /dev/components page showing every one.
- App shell: mobile bottom navigation, desktop sidebar, placeholder pages, 404 and error pages, and an always-visible SOS button that opens a placeholder sheet.
- next-intl with every string in message files.
- Security headers and CSP from section 10.

Done when:
- The app runs locally and CI passes on a pull request.
- The theme toggles without a flash and persists across reloads.
- Every component passes axe with zero violations in both themes, with visible keyboard focus everywhere.
- Lighthouse scores 95+ in every category on the shell.
- README explains setup from a fresh clone.
```

## Phase 2 — Accounts, consent and profiles

```text
Read CLAUDE.md. Phase 2: Accounts, consent and profiles (sections 7.1, 7.2, 7.3 and 11). Plan first.

Build:
- Supabase Auth: Google sign-in, email + password with a breached-password check, magic link, email verification, password reset, optional two-factor.
- Sign-up flow: 18+ confirmation, consent screen saved to `consents`, then onboarding (7.2).
- `profiles` and `privacy_settings` with RLS and pgTAP tests.
- Profile page and editor: the avatar pipeline (crop, compress, re-encode, strip EXIF/GPS, nudity-screening hook), handle, bio, testimony, favourite verse, privacy controls.
- Sessions page with sign-out-everywhere; new-device email alert.
- Data export and account deletion with the 14-day grace period.
- Rate limits and Turnstile on every auth form.

Done when:
- I can sign up with Google and with email, log out, log in, reset a password and delete my account.
- Choosing "under 18" cannot create an account.
- An uploaded test photo with GPS data comes back without it.
- pgTAP proves user A cannot read or edit user B's private fields.
- All auth pages pass axe and work with only a keyboard and with a password manager.
```

## Phase 3 — Groups and invites (multi-tenancy)

```text
Read CLAUDE.md. Phase 3: Groups and invites (sections 6 and 7.4). This is the multi-tenancy core, so plan the RLS policies before any UI.

Build:
- `groups`, `group_members` and `group_invites` with RLS policies and pgTAP tests.
- Create-group wizard: name, description, cover, challenge type and dates, time zone, member cap, join policy, covenant.
- Invites by link, code and QR: hashed tokens, expiry, use limits, revoke and regenerate; a noindex invite page; a join flow with covenant acceptance and optional admin approval.
- Group switcher listing all my groups; group home skeleton; member list; roles with promote, demote, remove, transfer ownership, leave, archive and delete.
- Audit-log entries for every membership and role change.

Done when:
- One user can create two groups, belong to three, and switch between them.
- An automated test proves a member of group A gets zero rows from group B on every table and endpoint.
- Expired, revoked or used-up invites are refused with a friendly message.
- An admin cannot act on another group, even by calling the API directly.
```

## Phase 4 — Daily check-ins and streaks

```text
Read CLAUDE.md. Phase 4: Daily check-ins and streaks (section 7.5). Plan first.

Build:
- `checkins`, `user_stats` and `group_member_stats`: one check-in per user per local day, counted in all of their groups.
- Check-in screen: two large choices; optional mood, urge level, triggers and an encrypted private note; today plus yesterday until 12:00 local time.
- Current streak, longest streak, total clean days and check-in streak as Postgres functions, with tests for time zones (including half-hour offsets like India's), daylight-saving changes, midnight edges and the grace window.
- The compassionate slip flow.
- Per-group share-level views (checkin_only, streak, full, partner) as security-definer views with pgTAP tests.
- Private streak calendar and mood/urge/trigger charts with plain-language insights.
- Group home shows each member's check-in status for today according to their share level.

Done when:
- Users in India and New York each get the correct "today" in tests.
- A slip resets only the current streak; longest streak and totals stay.
- A member on "checkin_only" never reveals their outcome to the group (tested).
- Notes are encrypted and unreadable in the database console.
```

## Phase 5 — Levels, XP, badges and leaderboards

Built in three pull requests (owner, 2026-10-10): 5a levels, missed days, late offline check-ins and the grace review 1 wording (D-064–D-068); 5b XP, badges and the job queue; 5c leaderboards, the group goal, the "Together" total and invite details. A clean day earns no extra XP (D-069).

```text
Read CLAUDE.md. Phase 5: Levels, XP, badges and leaderboards (section 7.6). Plan first.

Build:
- `level_tiers` seeded from data/levels.json (tiers 0–167), and a pure function level_label(level) returning "Name", "Name Lite" … "Name Ultra Pro Max", with the "Well Done 2" fallback past Level 1002.
- The level engine as a Postgres function that replays a user's check-ins in date order: +1 progress per clean day; 5 days per level up to Level 20, then 10; a slip drops 10 levels (never below 0) and empties progress; each missed day (once its window has closed) costs exactly the same as a slip. Store level, level_progress_days and highest_level in user_stats, and read the level "live" so missed days count even when the person never opens the app. Update data/build_levels.py (`replay`) to the same rule first, and make the Postgres function match it.
- Server side of offline check-ins (section 7.5): accept a check-in made offline for the day it was made, within OFFLINE_SYNC_MAX_DAYS, even after the normal window, and replay the level, streaks and group stats. The device queue itself is Phase 10.
- Level card: name, era, verse and progress ("3 of 10 days to Ark Builder Max"); level-up animation and share card; era celebrations; a quiet grace message on level-down.
- Append-only `xp_ledger`, an XP config table, `badges` and `user_badges`; XP and badges awarded by idempotent queue jobs with the daily caps.
- Per-group leaderboards: Consistency XP (default), Level, Current streak, Clean days this challenge, Encourager; this-week and all-time; opt-out; ties to whoever got there first; precomputed tables refreshed by jobs.
- Group goal with a shared progress bar.

Done when:
- Tests match data/levels.csv for every level 0–1002 (label and days), e.g. Level 6 = "Breath of Life Ultra Pro Max" on day 30, Level 21 on day 110, Level 1000 = "Well Done Max" on day 9,900.
- Relapse tests: Level 25 drops to 15, Level 7 drops to 0, Level 0 stays 0, and progress empties.
- Missed-day tests: one missed day costs the same as one slip (Level 25 to 15); three missed days in a row drop Level 40 to 10; yesterday isn't missed until 12:00 local time; days before the account existed never count; a missed day still shows as "No check-in", never as a slip.
- An offline check-in for a missed day that syncs later removes that day's penalty; one older than OFFLINE_SYNC_MAX_DAYS, or claiming a day outside its window, is refused.
- Editing a check-in inside the grace window recalculates the level correctly.
- A member on "checkin_only" never shows a level to that group.
- A slip check-in earns the same check-in XP as a clean one, and replaying an event never awards XP twice.
- A leaderboard for a seeded 5,000-member group loads in under 200 ms.
```

## Phase 6 — Encouragement and accountability

```text
Read CLAUDE.md. Phase 6: Social and encouragement (section 7.7). Plan first.

Build:
- Reactions; nudges with rate limits and muting; the encouragement wall with posts (encouragement, prayer request with an "I prayed" counter, testimony, pinned announcement), one level of comments, edit and delete your own.
- Report and block, feeding the moderation queue (7.11), plus the automatic filter for slurs and explicit links.
- Accountability partner request, accept and end, with permissions.
- Milestone celebration cards posted to the group.
- Live updates on the group page through Supabase Realtime.

Done when:
- A blocked user can no longer see or interact with the blocker anywhere.
- Nudge limits hold under rapid repeated requests.
- A post containing script tags or HTML renders as plain text.
- Everything works by keyboard and reads correctly in a screen reader.
```

## Phase 7 — Notifications

```text
Read CLAUDE.md. Phase 7: Notifications (section 7.8). Plan first, including a diagram of the event-to-delivery pipeline.

Build:
- `notifications`, `notification_preferences`, `push_subscriptions` and per-group mutes.
- Event, then notification row, then queue, then a per-channel sender that respects preferences, quiet hours, digest mode, discreet mode, rate limits and duplicates.
- In-app bell, notification centre (mark read, mark all read), toasts announced through live regions, realtime updates, app-icon badge.
- Web Push with VAPID: a permission explainer after the first check-in, iOS add-to-Home-Screen guidance, cleanup of subscriptions that return 404 or 410.
- Email with React Email templates, neutral subject lines and one-click unsubscribe per type.
- Settings page: type-by-channel grid, per-group mute, quiet hours, digest, snooze everything.
- A reminder scheduler that runs every 15 minutes and picks users by local time.

Done when:
- Every notification type in 7.8 can be fired from a test script and arrives only on the enabled channels.
- With discreet mode on, no push or email contains a sensitive word (automated test over every template).
- Quiet hours hold back everything except partner SOS.
- Sending to a seeded 5,000-member group finishes without slowing page requests.
```

## Phase 8 — Recovery tools

```text
Read CLAUDE.md. Phase 8: Recovery tools (section 7.9). Plan first.

Build:
- SOS sheet: breathing animation, Scripture cards, a prayer, the 10-minute urge timer, quick actions (call partner, ask group to pray, go for a walk), urges-resisted tally.
- Encrypted private journal with prompts.
- Devotionals: verse of the day and reading plans from the database in a public-domain translation, with progress and XP.
- Resources page with crisis lines by country, and on-device detection of self-harm language that gently surfaces them.
- App lock (PIN or device biometrics) with auto-lock.

Done when:
- SOS opens in one tap from every screen and works offline.
- Journal entries are unreadable to admins and in the database console.
- The breathing animation has a reduced-motion version and screen-reader text.
```

## Phase 9 — Public website, motion and SEO/GEO

```text
Read CLAUDE.md. Phase 9: Public website, motion and SEO/GEO (sections 8 and 12). Plan first, and show me a storyboard of the scroll story before building it.

Build:
- Landing page scroll story "From chains to freedom": three.js hero where chains break and dissolve into light, a custom GLSL dawn shader, GSAP ScrollTrigger pinned scenes, SplitText headlines, Lenis smooth scrolling, View Transitions.
- Fallbacks for reduced motion, missing WebGL, low memory and Save-Data.
- Pages: how it works, about and statement of faith, FAQ, a blog and resources hub with MDX articles, Scripture guides, legal pages.
- Metadata, OG images, sitemap, robots.txt (AI crawlers allowed on public pages only), llms.txt, the JSON-LD from section 12, and noindex on every private route.
- Three starter articles written answer-first and marked for pastoral review.

Done when:
- Lighthouse on mobile scores 95+ in every category on the landing page with 3D on.
- The largest paint happens before three.js loads.
- The page is readable and usable with JavaScript turned off.
- Google's Rich Results Test validates the structured data.
- No private route is in the sitemap or indexable.
```

## Phase 10 — PWA and offline

```text
Read CLAUDE.md. Phase 10: PWA hardening (section 13). Plan first.

Build:
- Manifest with the discreet name, maskable and monochrome icons, shortcuts and screenshots.
- Service-worker caching strategies, offline page, offline check-in queue with Background Sync (each queued check-in keeps the local date and time it was made), update prompt.
- Custom install prompt and the iOS install sheet; Web Share and QR codes for invites.

Done when:
- The app installs on Android (Chrome) and iPhone (Safari) and opens full-screen.
- A check-in made in airplane mode syncs exactly once when back online.
- A check-in made offline yesterday, synced today after 12:00, counts for yesterday, and that day costs no levels.
- A new deploy shows "new version available" instead of serving stale code.
- Push notifications arrive on an installed iPhone.
```

## Phase 11 — Security, privacy and compliance hardening

```text
Read CLAUDE.md. Phase 11: Security and compliance hardening (sections 10 and 11). Plan first.

Do:
- Walk the OWASP ASVS 5.0 Level 2 requirements and write docs/asvs-checklist.md with pass, fail or not-applicable plus evidence for each; fix every fail.
- Update the threat model; run OWASP ZAP against a preview deploy and fix the findings.
- Verify CSP, headers, cookies, rate limits, the upload pipeline, encryption and backups; run a restore drill and document it.
- Draft the Privacy Policy, Terms, Community Guidelines, Accessibility Statement, Security page, security.txt, the "Your data" page, a data protection impact assessment, a record of processing, a retention schedule with deletion jobs, an incident-response plan and a CSAM reporting procedure. Mark all legal text as draft for a lawyer.
- Confirm no third-party tracker loads anywhere (network audit).

Done when:
- docs/asvs-checklist.md has no open Level 2 fails.
- Mozilla Observatory grade is A+.
- Data export and deletion work end to end and are documented.
```

## Phase 12 — Accessibility audit, scale and launch

```text
Read CLAUDE.md. Phase 12: Accessibility audit, performance, load testing and launch (sections 9 and 14). Plan first.

Do:
- Full WCAG 2.2 AA audit: axe on every route plus a manual checklist for keyboard, screen readers (NVDA, VoiceOver, TalkBack), zoom, reflow and contrast. Fix every issue; publish the accessibility statement.
- Meet the performance budgets; fix any route outside the LCP, INP or CLS targets.
- k6 load test: 1,000 concurrent users doing check-ins, reactions and notification fan-out; fix bottlenecks; record results in docs/load-test.md.
- Sentry, uptime checks, dashboards and alerts.
- Finish the admin dashboard (7.11); feature flags and kill switches in place.
- Launch checklist: domain, DNS, email authentication (SPF, DKIM, DMARC), verified backups, seeded devotionals, support email, grievance contact.

Done when:
- Zero automated accessibility violations and a completed manual checklist.
- The load test passes with p95 under 500 ms and no errors.
- Every launch-checklist item is done.
```

---

# Review prompts

Run these in a fresh session, so the reviewer hasn't watched the code being written.

## Security review

```text
Act as a hostile security reviewer who has never seen this code. Review the changes since the last review against CLAUDE.md section 10 and OWASP ASVS 5.0 Level 2. Specifically try to: read another group's data, read another user's check-in notes or journal, escalate from member to admin, reuse or brute-force an invite, inject script through any text field or upload, bypass rate limits, and find secrets in the repo or the client bundle. For each finding give severity, file and line, a failing test that proves it, and the fix. Write the tests first, then fix, then show them passing.
```

## Privacy and discretion review

```text
Review the app as a privacy officer, and as a user whose spouse, parent or roommate might pick up their phone. Check every notification template, email subject, page title, manifest name, share card, error message and log line for anything that reveals what the app is about or exposes sensitive data. Check every table and log for data we collect but don't need. List what to change, then change it.
```

## Accessibility review

```text
Act as an accessibility auditor. Test every route changed since the last audit against WCAG 2.2 AA: run axe, then go through each page with only a keyboard, at 200% zoom and 320 px width, in both themes, with reduced motion on, and describe what a screen reader announces for each interactive element. List each failure with its success-criterion number and fix it.
```

## Grace and tone review

```text
Read every piece of user-facing copy in the i18n files as someone who relapsed last night and feels ashamed. Flag anything judgmental, clinical, preachy or guilt-inducing, anything that makes a slip feel like failure, and anything that rewards hiding the truth. Suggest warmer rewrites rooted in grace, and check that every Scripture reference is accurate.
```
