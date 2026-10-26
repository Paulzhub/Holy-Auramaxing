/**
 * Devotionals (CLAUDE.md §7.9, D-112): pure helpers shared by the reading
 * pages and their tests. No server or browser code here.
 */
import { z } from "zod";

/** The three plans, by slug (messages under reading.plans.<titleKey>). */
export const READING_PLANS = [
  { slug: "7-days", titleKey: "p7", length: 7 },
  { slug: "30-days", titleKey: "p30", length: 30 },
  { slug: "90-days", titleKey: "p90", length: 90 },
] as const;
export type PlanSlug = (typeof READING_PLANS)[number]["slug"];
export type PlanTitleKey = (typeof READING_PLANS)[number]["titleKey"];

export const planSlugSchema = z.enum(READING_PLANS.map((p) => p.slug) as [PlanSlug, ...PlanSlug[]]);
export const planDaySchema = z.coerce.number().int().min(1).max(366);

export function planBySlug(slug: string) {
  return READING_PLANS.find((p) => p.slug === slug) ?? null;
}

/** A day number from the address (?day=N), if it's a day the plan has. */
export function parsePlanDay(raw: unknown, length: number): number | null {
  if (typeof raw !== "string" || !/^\d{1,3}$/.test(raw)) return null;
  const day = Number(raw);
  return day >= 1 && day <= length ? day : null;
}

/**
 * The verse of the day for a local date (YYYY-MM-DD): its day in a leap year,
 * so 29 February is day 60 and every other date keeps the same verse each
 * year (1 March is always day 61).
 */
export function verseDayOfYear(localDate: string): number {
  const [, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(2028, m - 1, d) - Date.UTC(2028, 0, 1)) / 86_400_000) + 1;
}

/**
 * Where someone is in a plan: the first day not yet read (days can be read in
 * any order), or null once every day is read. Nothing here knows about dates,
 * so a plan never says "behind" or "missed" (grace).
 */
export function nextUnreadDay(length: number, read: ReadonlySet<number>): number | null {
  for (let day = 1; day <= length; day++) if (!read.has(day)) return day;
  return null;
}

export interface Passage {
  ref: string;
  verses: [number, string][];
}

const passageSchema = z.array(
  z.object({ ref: z.string().max(40), verses: z.array(z.tuple([z.number().int(), z.string()])) }),
);

/** The passages column, checked (it is seeded, but nothing unchecked reaches the page). */
export function parsePassages(value: unknown): Passage[] {
  const parsed = passageSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
