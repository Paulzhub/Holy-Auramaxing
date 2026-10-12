import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The person's own level (CLAUDE.md §7.6), read live: missed days since the
 * last check-in already count (D-064). Runs as the signed-in person.
 */
export interface LevelOverview {
  level: number;
  label: string;
  era: string;
  tier: number;
  reference: string;
  verseText: string;
  progressDays: number;
  daysToNext: number;
  nextLabel: string;
  nextEra: string;
  highestLevel: number;
  /** Days missed since the last check-in whose windows have closed. */
  missedSinceLast: number;
  /** The level as of the last check-in, before those missed days. */
  storedLevel: number;
  /** The live level just before the last save, and its name and era. */
  levelBeforeSave: number | null;
  beforeLabel: string | null;
  beforeEra: string | null;
}

interface LevelJson {
  level: number;
  label: string;
  era: string;
  tier: number;
  reference: string;
  verse_text: string;
  progress_days: number;
  days_to_next: number;
  next_label: string;
  next_era: string;
  highest_level: number;
  missed_since_last: number;
  stored_level: number;
  level_before_save: number | null;
  before_label: string | null;
  before_era: string | null;
}

export function toLevelOverview(o: LevelJson): LevelOverview {
  return {
    level: o.level,
    label: o.label,
    era: o.era,
    tier: o.tier,
    reference: o.reference,
    verseText: o.verse_text,
    progressDays: o.progress_days,
    daysToNext: o.days_to_next,
    nextLabel: o.next_label,
    nextEra: o.next_era,
    highestLevel: o.highest_level,
    missedSinceLast: o.missed_since_last,
    storedLevel: o.stored_level,
    levelBeforeSave: o.level_before_save ?? null,
    beforeLabel: o.before_label ?? null,
    beforeEra: o.before_era ?? null,
  };
}

/** One database round trip per request, however many components ask. */
export const getMyLevel = cache(async (): Promise<LevelOverview> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_level");
  if (error || !data) throw new Error(`level: ${error?.message ?? "no data"}`);
  return toLevelOverview(data as unknown as LevelJson);
});
