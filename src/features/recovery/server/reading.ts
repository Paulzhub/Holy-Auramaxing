import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  nextUnreadDay,
  parsePassages,
  planBySlug,
  READING_PLANS,
  verseDayOfYear,
  type Passage,
  type PlanSlug,
  type PlanTitleKey,
} from "../reading";

/**
 * Devotionals (CLAUDE.md §7.9, D-112). Content is published (anyone may read
 * it); progress is read as the person, so RLS shows only their own.
 */

export interface VerseOfDay {
  reference: string;
  text: string;
}

export interface PlanProgress {
  slug: PlanSlug;
  titleKey: PlanTitleKey;
  length: number;
  read: Set<number>;
  /** The first day not read yet, or null when every day is read. */
  next: number | null;
}

export interface ReadingOverview {
  verse: VerseOfDay | null;
  active: PlanProgress | null;
  plans: PlanProgress[];
}

/** Today in the person's own time zone (§5). */
export function localDateIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export async function getVerseOfDay(localDate: string): Promise<VerseOfDay | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("verses_of_day")
    .select("reference, verse_text")
    .eq("day_of_year", verseDayOfYear(localDate))
    .maybeSingle();
  return data ? { reference: data.reference, text: data.verse_text } : null;
}

async function progressFor(userId: string): Promise<{ active: PlanSlug | null; plans: PlanProgress[] }> {
  const supabase = await createSupabaseServerClient();
  const [progress, active] = await Promise.all([
    supabase.from("devotional_progress").select("plan, day").eq("user_id", userId),
    supabase.from("devotional_active_plan").select("plan").eq("user_id", userId).maybeSingle(),
  ]);
  const read = new Map<string, Set<number>>();
  for (const row of progress.data ?? []) {
    if (!read.has(row.plan)) read.set(row.plan, new Set());
    read.get(row.plan)!.add(row.day);
  }
  const plans = READING_PLANS.map((p) => {
    const days = read.get(p.slug) ?? new Set<number>();
    return { slug: p.slug, titleKey: p.titleKey, length: p.length, read: days, next: nextUnreadDay(p.length, days) };
  });
  const activeSlug = planBySlug(active.data?.plan ?? "")?.slug ?? null;
  return { active: activeSlug, plans };
}

export async function getReadingOverview(userId: string, localDate: string): Promise<ReadingOverview> {
  const [verse, { active, plans }] = await Promise.all([getVerseOfDay(localDate), progressFor(userId)]);
  return { verse, active: plans.find((p) => p.slug === active) ?? null, plans };
}

export async function getPlanProgress(userId: string, slug: PlanSlug): Promise<PlanProgress & { isActive: boolean }> {
  const { active, plans } = await progressFor(userId);
  return { ...plans.find((p) => p.slug === slug)!, isActive: active === slug };
}

export async function getPlanDay(slug: PlanSlug, day: number): Promise<Passage[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("devotionals").select("passages").eq("plan", slug).eq("day", day).maybeSingle();
  return parsePassages(data?.passages);
}

/** Every day's chapter references for a plan's day list (no verse text). */
export async function getPlanOutline(slug: PlanSlug): Promise<Map<number, string[]>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("devotionals")
    .select("day, refs")
    .eq("plan", slug)
    .order("day", { ascending: true });
  const out = new Map<number, string[]>();
  for (const row of data ?? []) out.set(row.day, row.refs);
  return out;
}
