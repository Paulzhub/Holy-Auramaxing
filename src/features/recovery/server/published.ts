import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";

import { parsePassages, verseDayOfYear, type Passage, type PlanSlug } from "../reading";
import type { VerseOfDay } from "./reading";

/**
 * Published devotional content for the public Scripture guides (§12,
 * D-117), read as the anonymous role: no session, no progress, nothing
 * personal. The signed-in reading pages use ./reading.ts instead.
 */

export async function getPublishedVerseOfDay(localDate: string): Promise<VerseOfDay | null> {
  const { data } = await createSupabaseAnonymousClient()
    .from("verses_of_day")
    .select("reference, verse_text")
    .eq("day_of_year", verseDayOfYear(localDate))
    .maybeSingle();
  return data ? { reference: data.reference, text: data.verse_text } : null;
}

export async function getPublishedPlanDay(slug: PlanSlug, day: number): Promise<Passage[]> {
  const { data } = await createSupabaseAnonymousClient()
    .from("devotionals")
    .select("passages")
    .eq("plan", slug)
    .eq("day", day)
    .maybeSingle();
  return parsePassages(data?.passages);
}

export async function getPublishedPlanOutline(slug: PlanSlug): Promise<Map<number, string[]>> {
  const { data } = await createSupabaseAnonymousClient()
    .from("devotionals")
    .select("day, refs")
    .eq("plan", slug)
    .order("day", { ascending: true });
  const out = new Map<number, string[]>();
  for (const row of data ?? []) out.set(row.day, row.refs);
  return out;
}
