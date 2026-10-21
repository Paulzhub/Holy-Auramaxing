# Privacy and discretion review 2 (after Phase 7 and security review 2)

**Scope:** everything on `security/hostile-review-2` (Phase 7 plus security review 2), reviewed two ways: as a privacy officer (CLAUDE.md §2.3, §11, DPDP data minimisation and the right of access), and as someone whose spouse, parent or roommate might pick up their phone, read their inbox or scroll their browser history. Privacy review 1 (`docs/privacy-review-1.md`) covered Phases 1 to 4. This one covers what Phases 5 to 7 added: levels, XP, badges, leaderboards, the wall, nudges, partners, live updates, notifications, push, email, the manifest and the service worker. It also re-checks everything review 1 fixed.

**Method:**

- **Outward surfaces:** every notification template (push and email, both modes, every type and code), email subjects, headers and every link inside them; page titles; the manifest and service worker; the share card and its download name; invite sharing; every redirect target and query value an action produces; cookies and `localStorage` keys; error pages.
- **Logs and tables:** every log line (`devLog`, `audit()`, `util.audit`, the job queues, pg_net, pg_cron); every table and column added since review 1, with its retention, who can read it, and whether the data export includes it.
- **Verification:** each finding has a test that failed before the fix and passes after it.

Most of it was already discreet:

- **Notifications:** push titles are "Holy Auramaxing". Discreet mode is on by default and says only "You have a new message from your group". Email subjects are one neutral line.
- **Never sent anywhere:** no group name, badge, level or count of days leaves the app.
- **The share card** shows a level's name, era and verse reference only.
- **The service worker** caches nothing.
- **Sending addresses:** push endpoints are limited to the browsers' push services, and `notification_deliveries` holds no words.
- **Retention:** notifications are kept 90 days, dead jobs 30 days, and pg_net responses an hour.
- **Live pings** carry no content.
- **Logs:** `devLog` is silent in production.

## Findings

| ID    | Severity   | Finding                                                                                                                                                                                                                                                                     | Where (before the fix)                                                                                   | Test                                                                                                | Fix   |
| ----- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----- |
| PR2-1 | **Medium** | The slip page's own forms (the reflection, asking for prayer) came back to `/check-in/done?date=…&saved=1#reflection` or `…&prayer=askedGroup#prayer-title`. Only a slip shows those forms, so the browser history and the host's logs marked slip days again, undoing PR-2 | `src/features/checkins/server/actions.ts:97`, `src/features/social/server/accountability-actions.ts:161` | `src/test/discretion.test.ts` (slip page's forms); e2e `checkins.spec.ts`, `accountability.spec.ts` | D-098 |
| PR2-2 | **Medium** | Every notification email's unsubscribe links carried the account's id and the notification type in plain text (`?u=<id>&t=streak_at_risk`, `t=partner_sos`, `t=partner_missed`), in the email, its List-Unsubscribe header, the browser history and request logs            | `src/features/notifications/server/unsubscribe.ts`                                                       | Vitest `delivery.test.ts` (3 new checks, all types, raw HTML); e2e `delivery.spec.ts`               | D-098 |
| PR2-3 | Low        | Saving a reflection wrote `checkin.edited {"part":"reflection"}` to the security log. Reflections exist only after a slip, so the log, which platform admins will read (Phase 11), marked slip days                                                                         | `private.save_checkin_reflection` (`20261009000200_checkins_functions.sql:349`)                          | pgTAP `094` (1–4); e2e `checkins.spec.ts`                                                           | D-099 |
| PR2-4 | Low        | Leaderboard tabs put `?board=streak` and `?board=free_days` in the browser history                                                                                                                                                                                          | `src/features/gamification/leaderboards.ts`                                                              | Vitest `leaderboards.test.ts`, `discretion.test.ts`                                                 | D-098 |
| PR2-5 | Low        | Changing an answer pinged every group the person is in, including groups that see only "checked in", so a member watching the live channel learned the answer had just changed                                                                                              | `private.ping_on_checkin` (`20261019000100_social_live_updates.sql:108`)                                 | pgTAP `094` (5–8)                                                                                   | D-101 |
| PR2-6 | Low        | Nudges were kept forever, including "please pray for me" nudges sent from the slip page, whose dates line up with slips. Ended partnerships were kept forever too, and the other person could read why one ended (`blocked`, `closing`)                                     | `public.nudges`, `public.partnerships` (`20261018000100_social_nudges_partners.sql`)                     | pgTAP `094` (9–13)                                                                                  | D-100 |
| PR2-7 | Low        | pg_cron logged every run forever (about 25,000 rows a day from the 5- and 10-second workers), a log nobody reads                                                                                                                                                            | `cron.job_run_details`                                                                                   | pgTAP `094` (14–16)                                                                                 | D-100 |
| PR2-8 | Low        | "Download my data" left out nudges sent and received, accountability partnerships, and settings added since Phase 6 (milestone cards, nudge mutes, digest, snooze, sound, vibration, per-group mutes), although the database already returned most of them                  | `src/features/social/server/export.ts`, `profile/server/export.ts`, `groups/server/export.ts`            | (export sections)                                                                                   | D-102 |
| PR2-9 | Low        | The Privacy Policy didn't describe levels, XP, badges, nudges, partners, notifications or browser push services, or that email goes through Gmail for now                                                                                                                   | `messages/en.json` `legal.privacy`                                                                       | `discretion` and message tests                                                                      | D-102 |

### PR2-1 · The slip page's forms in the address (medium)

Privacy review 1 gave both answers one address (`/check-in/done?date=…`) so the history can't tell them apart. Phase 4's reflection form and Phase 6b's prayer card then sent their results back as `&saved=1#reflection`, `&error=…` and `&prayer=askedGroup#prayer-title`. Only the slip view has either form, so each of those addresses, in the history, the address bar's suggestions or the host's request log, meant "this day was a slip".

**Fix:**

- **Same address:** both forms now come back to exactly the address they were sent from.
- **Result in a cookie:** the result travels in a one-minute, httpOnly cookie (`notice`, `src/lib/server/flash.ts`) that the page reads for the same date only.
- **Scrolling:** a fragment can't be used either, so a small client component (`FocusOnArrival`) moves focus and the view to the result. Without JavaScript the result is still on the page, a little further down.
- **Test:** a unit test scans every `/check-in/done` address in the app's code and allows only `?date=`.

### PR2-2 · Readable unsubscribe links (medium)

RFC 8058 links needed the person and the type, and they were signed but readable. The link sits in the email's HTML (mail apps show it on hover), in the `List-Unsubscribe` header (some apps show it), in the browser history once opened, and in request logs. `t=partner_sos` or `t=streak_at_risk` names the topic, and `u=` is the account id.

**Fix:**

- **One opaque value:** the link carries only `?k=`, the person and the type sealed with AES-256-GCM under a key derived from `APP_ENCRYPTION_KEY` (`notification-unsubscribe-v2`).
- **New each time:** the value differs in every email, so two emails can't be linked by their links either.
- **Still tamper-proof:** any changed character fails.
- **Old links stop working:** links in emails sent before this change show "This link isn’t valid any more" and the settings link. No real users had them yet.

### PR2-3 · The reflection in the security log (low)

**Fix:** a reflection is the person's own private note, like the journal, not a change to their answer, so it's no longer audited. A changed answer still is (§7.5). The migration removes earlier reflection entries.

### PR2-4 · Leaderboard tab names in the address (low)

**Fix:** tabs go by number (`?board=2` to `?board=5`; Consistency XP is the default and has none). Old named links fall back to Consistency XP.

### PR2-5 · Pings after a changed answer (low)

**Fix:** a new check-in still pings every group ("checked in: yes" shows everywhere). A changed answer now pings only groups where the person shares at least their streak, or has an active partner, because only those groups see something change.

### PR2-6 · Nudges and ended partnerships kept forever (low)

**Fix:**

- **Retention:** a daily clean-up (`private.privacy_retention`, 03:41 UTC) removes nudges and ended partnerships after 90 days (`social_keep_days`).
- **The reason stays ours:** the API no longer shows `partnerships.ended_reason`, through column grants. Nothing in the app used it.

### PR2-7 · The scheduler's log (low)

**Fix:** the same clean-up keeps `cron.job_run_details` for 7 days (`cron_log_keep_days`).

### PR2-8, PR2-9 · Export and copy

**Export:** three new sections (nudges sent, nudges received, partnerships) and the missing settings columns.

**Privacy Policy:**

- It now covers:
  - levels, XP and badges, and who sees them;
  - nudges (kept 90 days) and partners (what a partner sees, and the alerts, only with consent);
  - notifications (kept 90 days);
  - the browser push services, which get an encrypted message they can't read;
  - Gmail as today's email provider.
- `POLICY_VERSION` is `2026-10-21-draft`.
- The "Your data" page mentions history addresses and email links.

## For the owner (can't be fixed in code)

1. **Gmail's Sent folder.** While email goes through Gmail SMTP, Gmail keeps a copy of every message sent from holyauramaxing@gmail.com in its Sent folder. That is every member's address, every security alert and notification email, and (once Supabase Auth uses the same SMTP) every sign-in and password-reset link. Each link expires within the hour, but the list of who uses the app stays.
   - Protect that account with two-step verification.
   - Don't share it, and empty its Sent folder from time to time.
   - Move to Resend or Amazon SES with your own domain when you can (D-031).
2. **Domain.** Still open: choose one without "xxx" or the topic in it (review 1).
3. **Google sign-in consent screen.** Name it "Holy Auramaxing" with a neutral logo (review 1).

## Checked, nothing to change

- **Push:** the title is "Holy Auramaxing".
  - **Discreet mode (the default):** one of a few neutral lines.
  - **Discreet mode off:** the other person's name and a neutral action (owner, 2026-10-13).
  - **Never:** a group's name, anyone's words, a level, a badge or a number (`discretion.test.ts`, every type and code).
  - **Tag and link:** the tag is the delivery id, and the link is a path inside the app.
- **Email:**
  - Two subjects: "You have a new update" and "A security alert for your account".
  - The sender is "Holy Auramaxing", and there are no remote images, so no tracking pixel.
  - The "why" line names the setting in neutral words.
  - Security alerts name a coarse device and a time, never a place or an IP.
- **Tab titles:** neutral everywhere ("Partner", "Wall", "Leaderboard", "Emails"), and never a group's name.
- **Manifest and iPhone title:** "Holy Auramaxing", `start_url` `/home`, with a neutral description and icons.
- **The service worker** only shows what the push carries, and caches nothing.
- **Share card and download:**
  - **Card:** a level's name, era and verse reference, and the app's name.
  - **Not offered** for levels whose name gives the topic away (D-065).
  - **Download:** saves as `level.png`.
- **Invites:** "Join my group on Holy Auramaxing" and `invite-qr.svg`.
- **Other addresses:** every `?notice=`, `?error=`, `?kind=`, `?range=` and `?month=` value is neutral.
- **Cookies and storage:** `theme`, `aura_device`, `aura_invite`, `signup_*`, `notice` (new), and one `localStorage` flag for the push explainer. None names the topic.
- **Logs:**
  - **App logs:** `devLog` is development-only.
  - **Audit log:** `audit()` and `util.audit` carry ids, methods and counts, and `checkin.synced_late` a date. They hold no content, emails or IPs.
  - **Notification sender:** answers with counts, and pg_net responses are cleared hourly.
  - **Job queues:** jobs carry ids only and are deleted when done (not archived). Dead ones go after 30 days.
  - **`notify-doctor.txt`:** git-ignored, and shows people by the first 8 characters of their id.
- **Tables:**
  - `push_subscriptions` keeps a coarse device label, not the browser string.
  - `notifications.data` holds ids and codes only (512 bytes at most).
  - `notification_deliveries` holds statuses and reasons only.
  - `leaderboard_entries` is read only through functions that apply share levels.
  - `xp_ledger` is owner-only, and a slip earns the same XP (D-069).
  - `reports.snapshot` is cleared on resolution.
  - `realtime.messages` holds content-free pings.
- **Group-visible signals of a slip:**
  - Level and badges show only at streak/full (D-072).
  - Consistency XP and the check-in bonus are the same for both answers (D-069).
  - "Together" and goals count only streak/full members (D-075).
  - Milestone cards appear only where the streak is shared (D-085).
  - A level drop is never notified.

## Requirements carried forward

- **Phase 8:** journal entries are private notes. Don't audit them (D-099), and don't let a journal or SOS action redirect with an answer-shaped query or fragment; use `setFlash()`. The SOS sheet's address must be neutral, like every other.
- **Phase 9:** manifest screenshots made from sample data; check how "Holy Auramaxing" truncates under a home-screen icon.
- **Phase 10:** the app lock remains the main protection when someone else holds the unlocked phone. Any offline page or cache must not store the slip view, and must be cleared on sign-out.
- **Phase 11/12:** the platform admin's audit-log viewer must show ids and actions only. Sentry must scrub query strings, cookies (including `notice`) and request bodies.
- **Any phase:**
  - Any new redirect after a form on a page whose content depends on an answer goes through `setFlash()`, never a query or fragment.
  - Any new link in an email carries only opaque values.
  - Any new table that records activity needs a retention line in `private.privacy_retention` or an existing clean-up.
