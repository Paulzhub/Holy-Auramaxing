# Accessibility review 1 (after privacy review 1 and the rename)

**Scope:** every route on `main` after PR #17. There was no earlier accessibility audit, so every route counted as "changed since the last audit": 35 pages in 43 states. Those states include the owner's group pages with real members and invites, the check-in form before and after answering, the thank-you and slip pages, the SOS sheet open, the sign-up steps with their error states, `/welcome` for a new account, and `/account-closing`. **Standard:** WCAG 2.2 AA (CLAUDE.md §9).

**Method:** each page was loaded as a group owner with five weeks of check-ins, as a new account, as an account being closed, and signed out. Each one then went through:

- **axe-core** (WCAG 2.0/2.1/2.2 A and AA tags plus best practices) in the light and dark themes, at 1280 px and 320 px, and under forced colours.
- **Keyboard only:** tabbing through every stop, checking that each one shows a focus ring, is not hidden behind the sticky bar, bottom navigation or SOS button, and that nothing is out of reach. The SOS dialog was checked for focus moving in, staying in, and returning to the SOS button on Escape.
- **200% zoom** (a 1280 × 860 window, which is 640 × 430 CSS px) and **320 px width** (also what 400% zoom gives): sideways scrolling, content cut off, and how much of the screen fixed bars take.
- **Text spacing** (WCAG 1.4.12 values) at 1280 and 320 px, looking for clipped text.
- **Reduced motion:** any animation still running.
- **Screen reader:** the accessibility tree (what NVDA, VoiceOver or TalkBack announce) for every interactive element on every page, checked for unnamed controls, names that don't say what they act on, heading order, landmarks, page titles, live regions and states.

No real screen-reader devices were used here. The manual NVDA, VoiceOver and TalkBack passes are still due in Phase 12.

## What was already right

- **axe:** zero violations on every page and state in both themes and at both widths. Under forced colours axe reports false contrast failures, because it reads the theme's colours rather than the forced ones. Screenshots show black text on white and visible focus rings.
- **Keyboard:** every stop has a visible focus ring, none is hidden behind the sticky bars (2.4.11), the skip link works, and the SOS dialog keeps focus inside and returns it to the SOS button. Tab order follows the page.
- **Names:** every control has an accessible name. Icon-only buttons have hidden labels, and the theme buttons say whether they are pressed. The calendar reads "October 8: Slipped, forgiven", charts have a table of the same numbers, the streak ring is a labelled `progressbar` with a spoken value, and member actions are grouped as "Actions for friend_x".
- **Structure:** one `h1` per page, no skipped heading levels, `main`/`nav`/`complementary` landmarks, `lang="en"`, and a unique "Page | Holy Auramaxing" title on every page (two gaps are below).
- **Motion:** nothing animates with reduced motion on (motion tokens drop to 0 ms, and spinners and shimmers stop).
- **Target size:** axe's 2.5.8 check passes everywhere, and the main controls are at least 44 px.

## Findings

| ID   | WCAG                             | Severity | Finding                                                                                                                                                                                                                                                                                                                     | Where (before the fix)                                                                                                                          | Test                                                                       |
| ---- | -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A-1  | 1.4.10 Reflow, 2.4.11            | **High** | At 480 px and below, the group switcher's menu opened off the left edge of the screen: "All groups", "Start a group" and the start of every group name were cut off and could not be scrolled to                                                                                                                            | `src/styles/groups.css` `.group-switcher__panel` (anchored to the button's right edge, mid-row)                                                 | e2e `a11y-review.spec.ts` "its menu opens fully on screen" (320–640 px)    |
| A-2  | 1.3.1 Info and relationships     | Medium   | When changing an answer, the ring marking the current answer never showed (two class names had merged into one), and screen readers weren't told which answer was current                                                                                                                                                   | `src/features/checkins/components/checkin-choices.tsx:36`                                                                                       | e2e "the current check-in answer is announced"                             |
| A-3  | 2.2.1 Timing adjustable          | Medium   | Info and success toasts closed after 8 seconds unless hovered or focused, so a screen-reader or slow reader could lose the message                                                                                                                                                                                          | `src/components/ui/toast.tsx` (`AUTO_DISMISS_MS`), D-012                                                                                        | Vitest `components.test.tsx` "keeps a success toast until it is dismissed" |
| A-4  | 4.1.3 Status messages            | Medium   | Several status messages were added to the page together with their live region, or hidden with `display: none` while empty, so screen readers could miss them: "Checking the name…" (handle check), "Saved. Only you can read it." (reflection), the photo-upload status, "We've sent you a link", and the Turnstile notice | `text-field.tsx`, `checkin-views.tsx` (reflection), `turnstile.tsx`; `.auth-sent:empty`, `.profile-avatar__status:empty`, `.group-status:empty` | Vitest "keeps the loading status region in place"                          |
| A-5  | 1.4.10 Reflow, 1.4.4             | Low      | The words "Your groups" in the top bar were cut to "Your gr…" between 480 and 767 px, for example on a laptop at 200% zoom                                                                                                                                                                                                  | `src/styles/groups.css` (`max-inline-size: 9rem` at ≤ 767 px)                                                                                   | e2e `"Your groups" is never cut short`                                     |
| A-6  | 2.4.2 Page titled                | Low      | All three sign-up steps and the under-18 page had the same title, "Create your account"                                                                                                                                                                                                                                     | `src/app/[locale]/(auth)/sign-up/**/page.tsx`                                                                                                   | e2e "each sign-up step has its own title"                                  |
| A-7  | 2.4.6 Headings and labels        | Low      | On the Invites page, every invite's "Replace with a new one" and "Stop this invite" sounded identical, and nothing said which invite they act on                                                                                                                                                                            | `src/features/groups/components/invite-manager.tsx:267`                                                                                         | e2e "each invite's actions name the invite"                                |
| A-8  | 1.4.10 Reflow, 2.4.11 (advisory) | Low      | On short screens (a laptop at 200% zoom, a phone held sideways) the sticky top bar and the bottom navigation together took 40% of the height                                                                                                                                                                                | `src/styles/shell.css` `.shell-topbar`                                                                                                          | e2e "the top bar scrolls away"                                             |
| A-9  | 1.4.11 (forced colours)          | Low      | The current-answer ring is a box shadow, which forced colours removes                                                                                                                                                                                                                                                       | `src/styles/checkins.css`                                                                                                                       | (visual)                                                                   |
| A-10 | 1.4.10 Reflow                    | Info     | `/dev/components` only: the static dialog preview overflowed its column at 640 px                                                                                                                                                                                                                                           | `src/styles/components.css` `.ui-dialog--static`                                                                                                | e2e reflow at 320 px includes `/dev/components`                            |

### A-1 · The group menu off the screen (high)

On phones the switcher button sits in the middle of the top bar, and its menu was anchored to the button's right edge with a width of `100vw − 2rem`. At 320 px it started 127 px left of the screen. **Fix:** in the top bar, the menu is positioned against the bar itself, spans it with a 16 px gutter (up to 22 rem, right-aligned), and scrolls within the space between the bars on short screens. The desktop sidebar is unchanged.

### A-2 · The current answer (medium)

`` `checkin-choice--${value}${current === value ? "checkin-choice--current" : ""}` `` produced `checkin-choice--cleancheckin-choice--current`: the same class-merging trap noted in the Phase 4 handoff. **Fix:** `cn()`, plus a hidden "(your answer now)" after the label, so the button reads "I stayed free today (your answer now)". The visible label still starts the accessible name (2.5.3). Under forced colours a double border replaces the shadow (A-9).

### A-3 · Toasts on a timer (medium)

D-012 let info and success toasts close after 8 seconds, pausing on hover or focus. Screen-reader and keyboard users rarely hover, and CLAUDE.md §9 says "No time limits". **Fix (D-060):** no toast leaves on a timer. Each stays until dismissed, and only the newest three are kept. Toasts are only used on `/dev/components` so far, so nothing changes for people yet. Phase 7 builds on this.

### A-4 · Status messages screen readers could miss (medium)

A live region has to be in the accessibility tree before its message arrives. **Fix:** these regions are always rendered and only their text changes. One rule in `components.css` keeps any empty `[role=status]` or `[aria-live]` region out of the layout but in the tree, replacing three `:empty { display: none }` rules that took them out of it.

### A-5 to A-10

- **A-5:** the static "Your groups" label is never shortened. A group's own name may still shorten with "…", because it is shown in full in the menu and on the group's page. Below 1024 px the brand wraps onto two lines ("Holy / Auramaxing") to make room. Below 480 px only the icon shows, as before.
- **A-6:** titles are now "Create your account, step 1 of 3" (and 2, 3), and "Thank you for being honest" for under-18s. `discretion.test.ts` still passes.
- **A-7:** each invite's actions are a group named "Invite made 9 Oct 2026, working until 16 Oct 2026", like the member actions.
- **A-8 (D-061):** when the screen is 30 rem (480 px) tall or less, the top bar scrolls away with the page. The bottom navigation and the SOS button stay.

## Side find (not accessibility)

- **Group names cut at a space failed to save.** `private.make_group_slug` trimmed hyphens before cutting the slug to 40 characters, so a name whose 40th character was a space or punctuation mark made a slug ending in "-". The slug check refused it, and creating the group failed. **Fix (D-062):** migration `20261013000100_groups_slug_trailing_hyphen.sql` trims again after the cut. pgTAP `026_groups_slug`.

## Still to do (Phase 12)

- Manual passes with NVDA (Windows), VoiceOver (iPhone and Mac) and TalkBack (Android) on real devices, and the published accessibility statement.
- Re-run this review after Phases 5–9. Leaderboard tabs, reactions, the wall, notifications, the SOS tools and the landing page's 3D and scroll story all need the same checks. `tests/e2e/a11y-review.spec.ts` covers reflow, reduced motion and titles for every route in `fixtures.ts`, so add new routes there.
