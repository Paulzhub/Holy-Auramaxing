# Grace and tone review 1

**Scope:** every string in `messages/en.json` (1,500 lines) and `src/app/global-error-messages.ts`, plus the Phase 5 copy and rules already written into the master spec (levels, leaderboards, nudges), because they will become strings soon. The 1,003 level names and verses in `data/levels.csv` were not checked here.

**How it was read:** as someone who slipped last night, feels ashamed, and opens the app this morning to answer for yesterday. Every string was checked for anything judgmental, clinical, preachy or guilt-inducing, anything that makes a slip feel like failure, and anything that makes hiding the truth pay better than telling it. Every Scripture quotation was checked word for word against the World English Bible on ebible.org.

**Nothing has been changed yet.** Each finding has the current text and a suggested rewrite. G-1 and G-2 are product decisions for the owner, not wording fixes.

## Owner's decisions (2026-10-10)

- **G-1, decided differently from the suggestion:** instead of making slips cheaper, **every missed day now costs the same as a slip: 10 levels**, counted per day (a week with no check-ins costs 70 levels). Silence no longer beats the truth. A missed day still shows as "No check-in", never as a slip.
- **Offline check-ins (new):** a member without internet can check in; it syncs automatically when they reconnect and counts for the day it was made, which removes that day's penalty.
- **G-2, closed:** the Current streak and Clean days leaderboards and the group goals stay. The app is built "not to hide but to be free through accountability". The suggested covenant warning won't be added.
- **Wording (owner, 2026-10-10): go with the suggestions.** G-3 to G-9, G-11, G-12, G-14, G-15 and S-1 were applied in Phase 5a (D-068). G-10 (reactions) is done when Phase 6 builds them, G-13 (reminders and nudges) in Phase 7.

These are recorded in `claude/master-spec.md` (§2.2, §7.5, §7.6, §13), `claude/phase-prompts.md` (Phases 5 and 10) and `claude/handoff-phase-5.md`; the Phase 5 session applies them to `CLAUDE.md`, `PROMPTS.md`, `data/build_levels.py` and D-063.

## What is already right

The copy is warm far more often than not. These are worth protecting:

- "A slip resets a streak, never a person." (landing) and "A slip resets a streak, never you. You are forgiven, and you are not alone." (slip page).
- "Either answer earns the same reward. Honesty is what counts." on the check-in form, and it is true: a slip earns the same check-in XP.
- A missed day is shown as "No check-in", never as a slip.
- The slip page leads with thanks ("Thank you for being honest"), then 1 John 1:9, then gentle, concrete next steps. No red, no alarms.
- "Every one of those days was real, and none of them is undone."
- The SOS sheet: "You reached out. That took courage." and the "I'm okay for now" button.
- The default covenant ends "A slip is met with grace, never shame", and the Full share level says "Honesty is never shamed here."
- The check-in-only share level lets people be honest without the group seeing the outcome.
- The under-18 page: "there is no shame in asking for help", with Romans 8:1 and real helplines.
- Deleting an account: "Whatever comes next, you're always welcome back."
- The insights are kind: "Be extra kind to yourself on those", "It might be a good week to lean on your group."

## Findings

| ID   | Severity | Finding                                                                                                                                                                | Where                                                                                                        |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| G-1  | **High** | A reported slip costs 10 levels, a missed day costs none. Skipping the check-in is now safer than telling the truth. **Decided: a missed day now costs 10 levels too** | Master spec §7.6 relapse rule (Phase 5)                                                                      |
| G-2  | **High** | Streak and clean-day leaderboards and group goals turn a slip into a visible drop in front of friends. **Closed: the owner keeps them**                                | Master spec §7.6 leaderboards and group goals; `groups.fields.minShareLevelHint`                             |
| G-3  | Medium   | "Clean days" makes the other days unclean                                                                                                                              | 4 keys now, more in the spec                                                                                 |
| G-4  | Medium   | "His mercies are new this morning" shows at night                                                                                                                      | `checkins.mercies.title`                                                                                     |
| G-5  | Medium   | The reflection is framed as a way to grow the next streak                                                                                                              | `checkins.mercies.reflectionTitle`, `reflectionLede`                                                         |
| G-6  | Medium   | "Your streak may have reset today" and "Today can be day one" are wrong when answering for yesterday, and "may have" sounds evasive                                    | `checkins.kept.slipTitle`, `kept.body`                                                                       |
| G-7  | Medium   | SOS assumes the person hasn't slipped yet. After a slip, "the way of escape" can read as "there was a way out and you didn't take it"                                  | `sos.*`                                                                                                      |
| G-8  | Low      | "Tell someone you trust" is an order, given at the moment of most shame                                                                                                | `checkins.mercies.prayerBody`                                                                                |
| G-9  | Low      | "Grace covers it" is vague and can sound like brushing it off; the slip label differs between calendar and group                                                       | `checkins.today.doneSlipped`, `form.answeredSlipped`, `ui.calendar.status.slipped`, `checkins.group.slipped` |
| G-10 | Low      | "Stay strong" and "On fire" reactions on someone's shared slip                                                                                                         | `ui.reactions.kinds`                                                                                         |
| G-11 | Low      | "You stayed free on 3 of the 20 days" reads like a score                                                                                                               | `checkins.insights.freeDays`                                                                                 |
| G-12 | Low      | The streak ring says "0 days, toward your longest of 47" the morning after                                                                                             | `checkins.stats.ringValue`                                                                                   |
| G-13 | Low      | "Streak at risk" reminders and the "Check in today" nudge add pressure                                                                                                 | Master spec §7.5, §7.7                                                                                       |
| G-14 | Idea     | Psalm 51 suggestion could say where to start                                                                                                                           | `checkins.mercies.next.verse.body`                                                                           |
| G-15 | Idea     | Nothing speaks to someone deleting their account because of a hard stretch                                                                                             | `accountData.deletePage`                                                                                     |
| S-1  | Low      | Romans 8:1 has "for those"; the WEB has "to those"                                                                                                                     | `auth.underEighteen.verseText`                                                                               |
| S-2  | Cosmetic | Small punctuation differences and straight apostrophes in some verses                                                                                                  | see the Scripture table                                                                                      |

---

### G-1 · Hiding a slip pays better than telling the truth (high)

The spec's relapse rule drops a person 10 levels for every reported slip, at every level. Above level 20 that is 100 clean days of progress. A missed day, by contrast, only empties the progress bar.

So the person who slipped last night has three choices:

| What they do                    | Cost                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| Tell the truth                  | Lose 10 levels (up to 100 days of progress), streak resets |
| Say nothing (skip the check-in) | Progress bar empties, streak ends, **no levels lost**      |
| Lie ("I stayed free")           | Nothing                                                    |

This breaks product principle 2 ("Nothing may make lying more rewarding than telling the truth") and principle 1 (a 10-level drop is a punishment, and it feels like one). The equal XP for honest check-ins doesn't balance it, because XP never affects levels.

**Suggestion (owner's decision):** make a slip cost the same as a missed day: the progress bar empties, the level stays. Then telling the truth never costs more than silence, and the level becomes a record of how far God has brought someone, not a score that can be taken away. If you want a slip to cost more than a miss, keep it small and capped (one level, never below the start of the current tier) so a long journey isn't wiped out in one night.

If the rule stays, the level-down line in the spec ("You're now Ark Builder Pro. Your longest streak and total clean days are still yours.") should at least say "free days" (G-3), and lead with the person, not the level: "You're still here, and that matters. Your longest streak and every free day are still yours."

### G-2 · Slips become visible drops in front of friends (high)

The planned leaderboard tabs include **Current streak** and **Clean days this challenge**, and group goals are framed as "500 clean days together this month". In a group where the covenant requires sharing at least the streak and doesn't allow hiding, an honest slip:

- drops the person down the board in front of their friends, and
- visibly costs the whole group progress toward its goal.

That is social pressure to hide the truth, which is the opposite of what the group is for.

**Suggestions:**

- Keep **Consistency** (XP, where honesty counts equally) as the default tab, as planned.
- Drop the **Current streak** tab, or show it only to the person themselves. Longest streak or total free days never go down and don't expose a slip.
- Make group goals about things honesty can't hurt: "500 check-ins together this month", "100 prayers this month".
- Warn owners when they set the covenant. Add to `groups.fields.minShareLevelHint`:
  > "Everyone shares at least this much with the group. Members may choose to share more. Asking everyone to share their streak can make it harder for someone to be honest on a bad day."

### G-3 · "Clean" makes the other days unclean (medium)

In a faith app about purity, "clean days" quietly makes slip days "unclean". The app already has a better word: the check-in button says "I stayed free today" and the calendar says "Stayed free". Use "free days" everywhere.

| Key                         | Now                                                  | Suggested                                                                   |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `checkins.kept.cleanDays`   | "# clean day / # clean days"                         | "# free day / # free days"                                                  |
| `checkins.stats.totalClean` | "Clean days"                                         | "Free days"                                                                 |
| `groups.home.togetherBody`  | "Your group's clean days, added up, will show here." | "Your group's free days, added up, will show here." (or check-ins, see G-2) |
| `dev.card.body`             | "Together your group has 1,240 clean days."          | "Together your group has 1,240 free days."                                  |

Also in the spec: badge names ("clean-day milestones"), the "Clean days this challenge" tab, the level-down line, and the group-goal example. Internal names like `clean` in code can stay.

### G-4 · "This morning" at night (medium)

Onboarding says "Most people choose an evening time", so most slips will be reported at night.

- **Now:** `checkins.mercies.title` "His mercies are new this morning"
- **Suggested:** "His mercies are new every morning"

This also matches the words of Lamentations 3:23 exactly.

### G-5 · Reflection framed as streak performance (medium)

Minutes after the streak broke, the page says reflecting will help "the next streak grow longer". That turns a moment of honesty back into a scoreboard. "What led to it?" also sounds like an interview.

| Key               | Now                                                                                     | Suggested                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `reflectionTitle` | "What led to it?"                                                                       | "What was going on?"                                                                                      |
| `reflectionLede`  | "Optional, and private to you. Noticing the pattern helps the next streak grow longer." | "Optional, and private to you. Noticing what was happening can help you see the next hard moment coming." |

### G-6 · "May have reset today" (medium)

The person in this review is answering for **yesterday**, so "today" is wrong, and "may have" sounds like the app is hedging about bad news. "Today can be day one" is also wrong when the slip was today.

| Key              | Now                                                                                                      | Suggested                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `kept.slipTitle` | "Your streak may have reset today, but look at everything you kept"                                      | "Your streak starts again, but look at everything you kept"                                                |
| `kept.body`      | "Every one of those days was real, and none of them is undone. Today can be day one of the next streak." | "Every one of those days was real, and none of them is undone. Your next free day starts the next streak." |

### G-7 · SOS after a slip (medium)

Someone who already slipped may still tap SOS, out of shame rather than temptation. Everything in the sheet assumes the fall hasn't happened: "show me the way out you promised", and 1 Corinthians 10:13 on "the way of escape". The morning after, that can read as an accusation.

**Suggestion:** add one quiet line under the prayer, linking to the slip page's content (1 John 1:9, the next steps):

- New key `sos.afterSlip`: "Already slipped? There's grace for that too."
- New key `sos.afterSlipLink`: "Read this"

### G-8 · An order at the worst moment (low)

- **Now:** `mercies.prayerBody` "Tell someone you trust and ask them to pray with you. Soon you'll be able to ask your group or your partner to pray from right here."
- **Suggested:** "When you're ready, tell someone you trust and ask them to pray with you. You don't have to explain everything. Soon you'll be able to ask your group or your partner from right here."

### G-9 · "Grace covers it" (low)

"It" is vague, and the short phrase can sound like a shrug, which the ashamed reader may hear as the app not taking them seriously. Also, the same slip is "Slipped, forgiven" in the private calendar and "Slipped, held in grace" in the group. Pick one; "held in grace" is something a community can truthfully say, while forgiveness is God's to give.

| Key                             | Now                                              | Suggested                                               |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `checkins.today.doneSlipped`    | "You checked in today. Grace covers it."         | "You checked in honestly today. You're held in grace."  |
| `checkins.form.answeredSlipped` | "Your answer: you slipped, and grace covers it." | "Your answer: you slipped. You're still held in grace." |
| `ui.calendar.status.slipped`    | "Slipped, forgiven"                              | "Slipped, held in grace"                                |

### G-10 · Reactions on a shared slip (low)

The spec puts reactions on shared check-ins. "Stay strong" on a slip implies the person wasn't, and "On fire" doesn't fit at all.

- `ui.reactions.kinds.strong`: "Stay strong" → **"With you"** (fits every kind of post)
- `fire`: either hide it on slip check-ins, or rename to **"Proud of you"** (which also fits an honest slip).

### G-11 · Insight that reads like a score (low)

- **Now:** `insights.freeDays` "You stayed free on {clean} of the {total} days you checked in."
- **Suggested:** "You stayed free on {clean} of the {total} days you checked in, and you were honest every time."

This rewards the thing the app most wants to reward.

### G-12 · "0 days, toward your longest of 47" (low)

The ring's spoken and visible value is hardest to read the morning after. Add a zero case:

```
"ringValue": "{count, plural, =0 {Starting again. Your longest is {longest} days, and it's still yours.} one {# day, toward your longest of {longest}} other {# days, toward your longest of {longest}}}"
```

Consider showing the check-in streak (which a slip doesn't break) or total free days as the main number on that first day back.

### G-13 · "Streak at risk" (low, Phase 7)

When these become strings, avoid fear words. The reminder could be "Today's check-in is still open." and the nudge "Check in today" could be "Thinking of you today." Nudges must stay discreet anyway.

### G-14 · Psalm 51 (idea)

The reference is right: by its heading, Psalm 51 is David's prayer after Nathan confronted him about Bathsheba. A whole psalm of confession is a lot for someone already ashamed, so offer a starting place:

- **Suggested:** "Psalm 51 is David's prayer after he fell. Start with verses 10 to 12, and read slowly, out loud if you can."

### G-15 · Leaving after a hard stretch (idea)

Some people will delete their account the morning after a slip. One more line on the delete page could catch them:

- New key `accountData.deletePage.hardStretch`: "If you're leaving because things feel heavy right now, nothing you've done closes this door. You can come back any time."

---

## Scripture check

Checked against the World English Bible text on ebible.org.

| Where                                                     | Reference            | Result                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sos.verseText`                                           | 1 Corinthians 10:13  | ✓ Matches                                                                                                                                                                                                                                                                                                    |
| `pages.home`, `onboarding.welcome`, `accountData.closing` | Lamentations 3:22–23 | ✓ Matches. `onboarding.welcome.verseText` uses straight apostrophes (Yahweh's, don't); the other two use curly ones                                                                                                                                                                                          |
| `auth.underEighteen.verseText`                            | Romans 8:1           | **✗ Wording.** The WEB reads "no condemnation **to** those who are in Christ Jesus", not "for those" ("for" is the ESV/NIV wording). The verse also continues ("who don't walk according to the flesh, but according to the Spirit"). Quoting only the first part is fine and common; just fix "for" to "to" |
| `checkins.done.verseText`                                 | 2 Corinthians 2:14   | ✓ Words match. The sentence continues in the Bible ("…and reveals through us the sweet aroma of his knowledge in every place"); ending at "in Christ" is a fair stopping point. The current WEB has no comma after "God"                                                                                     |
| `checkins.mercies.verseText`                              | 1 John 1:9           | ✓ Words match. The current WEB has no comma before "and to cleanse"                                                                                                                                                                                                                                          |
| `checkins.mercies.next.verse.body`                        | Psalm 51             | ✓ Fits: David's prayer of confession                                                                                                                                                                                                                                                                         |
| `profile.editor.verseHint`                                | John 8:36            | ✓ A real and fitting example ("If therefore the Son makes you free, you will be free indeed.")                                                                                                                                                                                                               |

Apostrophes: the `onboarding`, `groups` and some `accountData` blocks use straight apostrophes (') while most of the file uses curly ones ('). Not a tone issue, but worth making consistent.

## Suggested order

1. ~~Decide G-1 and G-2 before Phase 5 is built.~~ Done 2026-10-10 (see "Owner's decisions" above).
2. Apply G-3 to G-9 in one pass over `en.json` (about 15 keys), and fix S-1.
3. Do G-10 to G-15 when those features are built or next touched.
