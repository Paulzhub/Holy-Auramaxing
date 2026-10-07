/**
 * Where a group's challenge stands (CLAUDE.md §7.4: scheduled, active,
 * completed, archived), worked out in the group's own time zone. Pure, so
 * it is safe for client and server code.
 */

export type GroupPhase =
  | { phase: "archived" }
  | { phase: "scheduled"; startsIn: number }
  | { phase: "active"; day: number; total: number | null }
  | { phase: "completed"; total: number };

/** Today's date in a time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export interface GroupDates {
  start_date: string;
  end_date: string | null;
  group_timezone: string;
  archived_at: string | null;
}

export function groupPhase(group: GroupDates, now: Date = new Date()): GroupPhase {
  if (group.archived_at) return { phase: "archived" };
  const today = todayIn(group.group_timezone, now);
  const sinceStart = daysBetween(group.start_date, today);
  if (sinceStart < 0) return { phase: "scheduled", startsIn: -sinceStart };
  const total = group.end_date ? daysBetween(group.start_date, group.end_date) + 1 : null;
  if (total !== null && sinceStart + 1 > total) return { phase: "completed", total };
  return { phase: "active", day: sinceStart + 1, total };
}
