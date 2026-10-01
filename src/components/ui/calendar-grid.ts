export type DayStatus = "clean" | "slipped" | "none";

export interface CalendarCell {
  /** ISO date (YYYY-MM-DD) or null for padding cells. */
  date: string | null;
  day: number | null;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Weeks for a calendar month. `month` is 1–12; `weekStartsOn` 0 = Sunday,
 * 1 = Monday. Pure date arithmetic in UTC so server and tests agree.
 */
export function buildMonthGrid(year: number, month: number, weekStartsOn: 0 | 1 = 1): CalendarCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (first.getUTCDay() - weekStartsOn + 7) % 7;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < leading; i++) cells.push({ date: null, day: null });
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: iso(year, month, day), day });
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Seven weekday dates (UTC) starting at `weekStartsOn`, for header labels. */
export function weekdayReferenceDates(weekStartsOn: 0 | 1 = 1): Date[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + ((i + weekStartsOn) % 7))));
}
