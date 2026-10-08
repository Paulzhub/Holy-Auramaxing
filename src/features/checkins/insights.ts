import { TRIGGERS, type Outcome, type Trigger } from "./constants";

/**
 * Plain-language insights from a person's own check-ins (CLAUDE.md §7.5),
 * e.g. "Urges run higher on weekdays" or "Tired and late night come up most".
 * Pure functions, run on the server: nothing is sent anywhere.
 *
 * Each insight is a message key under "checkins.insights" plus its values,
 * so the copy lives in the message files.
 */

export interface DayRecord {
  /** YYYY-MM-DD, the person's local date. */
  date: string;
  outcome: Outcome;
  mood: number | null;
  urge: number | null;
  triggers: readonly Trigger[];
}

export type Insight =
  | { key: "notEnough"; values: { needed: number } }
  | { key: "freeDays"; values: { clean: number; total: number } }
  | { key: "topTriggers"; values: { first: Trigger; second: Trigger | null } }
  | { key: "urgesWeekdays" | "urgesWeekends"; values: Record<string, never> }
  | { key: "urgesOnDay"; values: { weekday: number } }
  | { key: "moodRising" | "moodDipping"; values: Record<string, never> }
  | { key: "lowMoodUrges"; values: Record<string, never> }
  | { key: "hardDayTrigger"; values: { trigger: Trigger } };

/** Fewer check-ins than this, and patterns would just be noise. */
export const MIN_DAYS_FOR_INSIGHTS = 5;

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function countTriggers(days: readonly DayRecord[]): Map<Trigger, number> {
  const counts = new Map<Trigger, number>();
  for (const day of days) for (const t of day.triggers) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

/** Most frequent first; ties keep the fixed list's order, so results are stable. */
function ranked(counts: Map<Trigger, number>, minimum: number): Trigger[] {
  return TRIGGERS.filter((t) => (counts.get(t) ?? 0) >= minimum).sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
  );
}

/**
 * At most `limit` insights, the most useful first. Always starts with a
 * hopeful one (free days) when there is enough data.
 */
export function buildInsights(days: readonly DayRecord[], limit = 4): Insight[] {
  if (days.length < MIN_DAYS_FOR_INSIGHTS) {
    return [{ key: "notEnough", values: { needed: MIN_DAYS_FOR_INSIGHTS - days.length } }];
  }
  const out: Insight[] = [];
  const clean = days.filter((d) => d.outcome === "clean").length;
  out.push({ key: "freeDays", values: { clean, total: days.length } });

  // Triggers that keep coming up.
  const top = ranked(countTriggers(days), 2);
  if (top[0]) out.push({ key: "topTriggers", values: { first: top[0], second: top[1] ?? null } });

  // Urges: weekdays against weekends, then one weekday that stands out.
  const withUrge = days.filter((d) => d.urge !== null);
  const weekday = average(withUrge.filter((d) => ![0, 6].includes(weekdayOf(d.date))).map((d) => d.urge as number));
  const weekend = average(withUrge.filter((d) => [0, 6].includes(weekdayOf(d.date))).map((d) => d.urge as number));
  if (weekday !== null && weekend !== null && withUrge.length >= MIN_DAYS_FOR_INSIGHTS) {
    if (weekday - weekend >= 0.75) out.push({ key: "urgesWeekdays", values: {} });
    else if (weekend - weekday >= 0.75) out.push({ key: "urgesWeekends", values: {} });
  }
  const strong = withUrge.filter((d) => (d.urge as number) >= 3);
  if (strong.length >= 3) {
    const perDay = new Map<number, number>();
    for (const d of strong) perDay.set(weekdayOf(d.date), (perDay.get(weekdayOf(d.date)) ?? 0) + 1);
    const [bestDay, bestCount] = [...perDay.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0, 0];
    if (bestCount >= 2 && bestCount / strong.length >= 0.4) {
      out.push({ key: "urgesOnDay", values: { weekday: bestDay } });
    }
  }

  // Mood: the second half of the period against the first.
  const moods = days.filter((d) => d.mood !== null);
  if (moods.length >= 6) {
    const sorted = [...moods].sort((a, b) => a.date.localeCompare(b.date));
    const half = Math.floor(sorted.length / 2);
    const first = average(sorted.slice(0, half).map((d) => d.mood as number)) ?? 0;
    const second = average(sorted.slice(half).map((d) => d.mood as number)) ?? 0;
    if (second - first >= 0.5) out.push({ key: "moodRising", values: {} });
    else if (first - second >= 0.5) out.push({ key: "moodDipping", values: {} });
  }

  // Low moods and strong urges travelling together.
  const both = days.filter((d) => d.mood !== null && d.urge !== null);
  const lowMood = average(both.filter((d) => (d.mood as number) <= 2).map((d) => d.urge as number));
  const goodMood = average(both.filter((d) => (d.mood as number) >= 4).map((d) => d.urge as number));
  if (lowMood !== null && goodMood !== null && lowMood - goodMood >= 1) {
    out.push({ key: "lowMoodUrges", values: {} });
  }

  // What came up most on the harder days (gently worded in the copy).
  const hard = ranked(countTriggers(days.filter((d) => d.outcome === "slipped")), 2);
  if (hard[0] && hard[0] !== top[0]) out.push({ key: "hardDayTrigger", values: { trigger: hard[0] } });

  return out.slice(0, limit);
}

/** Times each trigger was ticked, in the fixed order, for the chart. */
export function triggerCounts(days: readonly DayRecord[]): { trigger: Trigger; count: number }[] {
  const counts = countTriggers(days);
  return TRIGGERS.map((trigger) => ({ trigger, count: counts.get(trigger) ?? 0 }));
}
