# Accessibility review 2 (after Phases 5–7 and the second security and privacy reviews)

**Scope:** every route changed since accessibility review 1 (PR #18, `1a136eb`), on top of privacy review 2 (`privacy/review-2`, PR #37). That covers Phases 5 (levels, XP, badges, leaderboards, group goal, invite details), 6 (wall, nudges, partners, reports, blocks, live updates), 7 (notifications, the alert centre, push, unsubscribe) and both reviews. In all, 28 page states, plus the app shell (sidebar, bottom navigation, bell and switcher), which every app page shares:

- `/home`, `/groups`, `/check-in`, `/check-in/done` (a slip and a free day), `/progress`, `/alerts`, `/me`
- `/settings`, `/settings/notifications`, `/settings/blocked`, `/settings/data/delete`
- a group's overview, wall, one post, all five leaderboards (and "This week"), members, moderation, partner, settings, invites and one invite's details
- `/unsubscribe` (an old link, and no link)

**Standard:** WCAG 2.2 AA (CLAUDE.md §9).

**Method:** a group was seeded with an owner (signed in through the form), a member sharing everything, one sharing only check-ins and one the owner had blocked. It had a slip and a free day, an accepted partner, posts of each kind, a comment, a prayer, a report, a nudge, a group goal and unread alerts. Each page then went through:

- **axe-core** (WCAG 2.0/2.1/2.2 A and AA tags plus best practices) in the light and dark themes, at 1280 px, at 640 × 430 (200% zoom on a 1280 × 860 laptop) and at 320 px.
- **Keyboard only:** every Tab stop at 1280 and 320 px, checking for a focus ring, for anything covering it (sticky bar, bottom navigation, SOS button), and for size. Then the forms themselves were used by keyboard (marking alerts read, nudging, saving settings, snoozing, reacting, posting, commenting, asking a partner, checking in) to see where focus goes afterwards.
- **200% zoom** and **320 px:** sideways scrolling, content cut off, and how much of the screen fixed bars take.
- **Text spacing** (WCAG 1.4.12 values) at 1280 and 320 px, looking for clipped text and sideways scrolling.
- **Reduced motion:** every page loaded with `prefers-reduced-motion: reduce`.
- **Forced colours** (Windows High Contrast), dark and light: screenshots of the new tabs, filters, reactions, alerts and charts.
- **Screen reader:** the accessibility tree (what NVDA, VoiceOver or TalkBack announce) for every interactive element, plus what is announced (live regions, Next.js's route announcer, focus) after each form above.

No real screen-reader devices were used here. The manual NVDA, VoiceOver and TalkBack passes are still due in Phase 12.

## What was already right

- **axe:** zero violations on every page, in both themes, at all three sizes.
- **Reflow:** nothing scrolls sideways at 320 px or at 200% zoom with normal text spacing.
- **Keyboard:** every stop shows a ring, nothing is out of reach, and the sticky bars never cover a focused control completely (2.4.11). A tall text box at the very bottom of a page can sit partly under the bottom navigation when focused, because Chrome scrolls a text box to its caret rather than its whole box. Its top and the focus ring stay visible.
- **Names:** reactions say what they are and whether they're yours ("Love, 1 reaction, including yours. Take yours back"). Nudge, report and block menus name the person. Member actions are grouped "Actions for Finn Friend", and post menus "More for this post". The notification grid's boxes are "Push Daily reminder" and "Email Daily reminder". Every alert says "Unread:" before its text, and its "Mark as read" names the alert. The leaderboard rows read "Rank 2 Olive Owner You 14 XP", and the level and streak rings are labelled progress bars with spoken values.
- **Structure:** one `h1` per page; tabs and filters are links with `aria-current="page"`; the calendar is a table with a caption; the push explainer, the wall's "new posts" notice and toasts use live regions that are always in the page.
- **Errors:** the wall's post and comment forms move focus to the error, mark the field `aria-invalid` and tie the error to it.
- **Motion:** nothing animates with reduced motion on. The level-up light stays still, and the motion tokens drop to 0 ms.
- **Contrast:** native check boxes in the dark theme measure 4.6:1 against the card. The gold "current" pills and the unread markers pass axe in both themes.

## Findings

| ID   | WCAG                                     | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                | Where (before the fix)                                                                                                                          | Test                                                                                       |
| ---- | ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A2-1 | 1.4.10 Reflow, 1.4.12 Text spacing       | **High** | On every leaderboard at 320 px, names were cut off with "…". The viewer's own row lost its name completely ("2 OO ( You 14 XP"), and "Hidden member" read "Hidde…". With wider text spacing it happened on the group page at desktop width too. With text spacing at 320 px, the Encourager board ("12 encouragements") scrolled the page sideways.                                                                                                    | `src/styles/components.css` `.ui-lb-row__name` (`nowrap` + ellipsis) and the row's `auto` score column                                          | e2e `a11y-review-2.spec.ts` "leaderboard names wrap", "320 px with wider text spacing"     |
| A2-3 | 2.4.3 Focus order, 4.1.3 Status messages | **High** | After nearly every form in the app (mark as read, mark all as read, nudge, save notification settings, snooze, ask a partner, block, report, moderation, membership changes), focus fell back to the top of the document, and the result ("Nudge sent.") appeared in a status banner added with the new page, which screen readers often don't announce. A keyboard user had to tab through the whole navigation again to get back to where they were. | Every server action that redirects with `?notice=` (alerts, settings, group, wall, partner, members, moderation, blocked, security, data pages) | e2e "after a form is sent, focus goes to its notice"; Vitest `focus-after-action.test.tsx` |
| A2-4 | 4.1.3 Status messages                    | **High** | After pressing "I stayed free today" or "I slipped", a screen reader said nothing. Focus fell to the document, the page title stays "Check in" (deliberately neutral), so Next.js's route announcer stayed silent. "Saved" and any level change ("You're now Ark Builder Pro…") were never read out. Review 1's handoff asked for level changes to be announced.                                                                                       | `src/app/[locale]/(app)/check-in/done/page.tsx`; `LevelChangeNotice`                                                                            | e2e "focus lands on the thank-you heading, which reads out that it was saved"              |
| A2-2 | 1.4.10 Reflow, 1.4.12 Text spacing       | Medium   | A one-word page title too wide for 320 px with wider text spacing ("Notifications") pushed the page sideways                                                                                                                                                                                                                                                                                                                                           | `src/app/globals.css` (headings never broke a word)                                                                                             | e2e "320 px with wider text spacing"                                                       |
| A2-7 | 1.4.1 Use of colour (forced colours, §9) | Medium   | In Windows High Contrast, the current leaderboard, the "This week / All time" choice, the wall's filter and the progress chart's range looked exactly like the others, because only their background colour marked them                                                                                                                                                                                                                                | `gamification.css` `.lb-tabs__link`, `.lb-periods__link`; `social.css` `.wall-filters__link`; `checkins.css` `.range-nav__link`                 | e2e "forced colours: the current tab still stands out"                                     |
| A2-5 | 1.3.1 Info and relationships             | Low      | On the moderation page each report's heading was an `h2`, at the same level as "Reports" above it                                                                                                                                                                                                                                                                                                                                                      | `src/features/social/components/wall-views.tsx` `ModerationList`                                                                                | e2e "the moderation queue's reports sit under its heading"                                 |
| A2-6 | 2.5.3 Label in name                      | Low      | In the bottom navigation the unread count was read before the label: ", 3 unread Alerts". Speech-input users say what they see ("Alerts"), and names should start with it                                                                                                                                                                                                                                                                              | `src/components/shell/primary-nav.tsx` `UnreadBadge` inside the icon                                                                            | e2e "Alerts' name starts with its visible label"                                           |
| A2-8 | 2.4.6 Headings and labels                | Low      | The unsubscribe page's heading was a whole sentence of instructions ("This link isn't valid any more. You can change what reaches you…"), and its "done" heading likewise                                                                                                                                                                                                                                                                              | `src/features/notifications/components/unsubscribe-view.tsx`                                                                                    | e2e "an old link gets a short heading"                                                     |
| A2-9 | 2.4.6 Headings and labels                | Low      | The level card was a region named only by the level ("Clay", "Ark Builder Pro"), so a screen reader's list of regions didn't say what it is                                                                                                                                                                                                                                                                                                            | `src/features/gamification/components/level-views.tsx`                                                                                          | e2e "the level card is named for what it is"                                               |

### A2-1 · Leaderboard names cut off (high)

`.ui-lb-row__name` kept the name on one line with an ellipsis. Next to the avatar, the "You" tag and the score, a phone had about 40 px left for a name, and none for the viewer's own. **Fix (D-104):** names wrap (`overflow-wrap: anywhere`) and the "You" or "Hidden from members" tag drops under the name when there's no room. The score column may shrink and wrap too, so "12 encouragements" fits with wider text spacing. Rows grow taller instead of losing text.

### A2-3 · Focus after a form is sent (high)

The app's forms are server actions that come back as a new page, usually the same address with a short notice. That keeps them working without JavaScript and keeps answers out of addresses (D-055, D-098). But the pressed button is gone by the time the page returns, so focus fell to `<body>`. The notice banner is added with the page, rather than changed inside a region that was already there, which review 1 (A-4) showed screen readers can miss.

**Fix (D-103):** `FocusAfterAction` (`src/components/ui/focus-after-action.tsx`) sits once in the app shell and once in the sign-in frame. After any form is sent, it watches for up to 10 seconds:

- **A new notice appears** (an `.auth-banner` with `role=status` or `role=alert`, or anything marked `data-arrival-focus`): focus moves to it. Focusing it reads it out, and the person continues from the result.
- **Focus was lost and there's no notice:** focus moves to the page's `h1`.
- **Nothing to do:** it does nothing if focus stayed somewhere sensible and no new notice appeared. That covers forms that already report inline, like the wall's post and comment forms, reactions and the reflection. It also does nothing if the person has moved on (clicked or tabbed elsewhere), and it gives a page's own `FocusOnArrival` the first go.

It needs no change to each notice component. A form can opt out with `data-keep-focus` on itself or an ancestor. Without JavaScript the page loads from the top, as before.

### A2-4 · Nothing said after checking in (high)

Both answers share one neutral address and title (D-055), so nothing changed that a screen reader would announce. **Fix:** the thank-you and slip pages mark their `h1` as the arrival target. It is described by the "Saved…" line and, when there is one, the level change, which now has the id `level-change`. Arriving from the form, focus lands on the heading, and a screen reader reads "Thank you for checking in, heading level 1. Saved: Today", or "His mercies are new every morning… Saved. Thank you for being honest. You're now Ark Builder Pro…". This also covers what review 1 asked of Phase 5: announce level changes. A level-up's light still respects reduced motion.

### A2-2 and A2-5 to A2-9

- **A2-2:** `h1`–`h3` may break inside a word, but only when the word can't fit on a line (`overflow-wrap: anywhere`).
- **A2-5:** report headings are `h3`.
- **A2-6:** the dot with the number stays on the bell icon (hidden from screen readers); the words ", 3 unread" now come after "Alerts" in both the bottom navigation and the sidebar.
- **A2-7:** under forced colours the current tab, period, filter and range get a 2 px `CanvasText` outline and an underline, like the group tabs and the main navigation.
- **A2-8:** the heading is "This link isn't valid any more" or "Done", and the rest is a line under it.
- **A2-9:** the card is named "Your level Clay" (the small "Your level" label plus the level).

## Seen, not changed

- **Partly covered focus:** see "Keyboard" above. It passes 2.4.11 (AA), which asks only that focus isn't _entirely_ hidden. 2.4.12 (AAA) would need a scroll script.
- **The wall's "There's something new" after your own post or reaction:** the live ping carries no author (D-086), so the wall can't tell it's yours. The polite notice is announced once. It isn't a WCAG failure, but it is noise; Phase 10's offline work could pass a "mine" hint in the page instead.
- **Three "Save" buttons on the notification settings page:** each sits in its own named region ("What reaches you", "When they reach you", "Groups"), and focus now lands on the result. They are fine under 2.4.6. Give them their own names if the page grows.
- **Leaderboard tabs share one tab title ("Leaderboard"):** this is deliberate, because a tab title like "Current streak" would say more than "Leaderboard" in a task switcher (§2.3). Focus stays on the chosen tab, which is marked current.
- **Invite details show times in the group's time zone without naming it** ("Oct 22, 2026, 1:28 AM" for a UTC group). This is not an accessibility issue. It is worth a "(group time)" note in Phase 11's admin pass.
- **Group switcher:** a group's own name may still shorten with "…" in the sidebar with wide text spacing. It is shown in full in the menu and as the page's `h1` (review 1, A-5).

## Tests added

- **e2e `tests/e2e/a11y-review-2.spec.ts`** (11 tests, desktop project):
  - axe in both themes on all 18 changed pages of a seeded group (a long member name, a report, a partner, alerts).
  - 320 px with and without text spacing: nothing scrolls sideways and nothing is clipped.
  - Leaderboard names, focus after forms, inline forms keep focus, the check-in arrival, moderation headings, forced colours, the level card's name, the bell's name, and the unsubscribe page.
- **`tests/e2e/support/layout.ts`:** `overflowing()` (moved out of the review 1 spec; it now ignores a closed `<details>` panel, which Chrome gives a box), `widenTextSpacing()` and `clippedText()`.
- **`fixtures.ts`:** `/settings/blocked` joins `appRoutes`, so the axe, keyboard and reflow suites cover it.
- **Vitest `src/components/ui/focus-after-action.test.tsx`** (8 tests).

## Later phases must

- **Server-action forms** need no extra work: the result notice is focused for you. A form that manages focus itself sets `data-keep-focus`. A page with a better arrival point than its notice or `h1` marks it `data-arrival-focus` (with `tabIndex={-1}`).
- **Never cut off names or scores with an ellipsis:** let them wrap. If a single line is unavoidable, the full text must be on the same screen.
- **Anything marked only by its background** (a current tab, a chosen filter, a pressed button) needs a forced-colours rule: an outline, a border or an underline.
- **Phase 8 (SOS, journal, devotionals):** the journal's save and the SOS quick actions are forms, so they get A2-3's focus handling. Check that the breathing animation and the urge timer stop under reduced motion, and that the timer's end is announced politely, never as an alert.
- **Phase 9:** reflow-test the landing page at 320 px _with text spacing_ (`widenTextSpacing`).
- **Phase 12:** real-device NVDA, VoiceOver and TalkBack passes, including the check-in arrival (A2-4) and a notice after a form (A2-3).
