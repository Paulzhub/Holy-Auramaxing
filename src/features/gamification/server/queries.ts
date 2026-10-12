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

/** A badge as the app shows it; names and descriptions come from messages. */
export interface Badge {
  slug: string;
  kind: "free_days" | "checkin_days" | "finisher" | "encourager" | "prayer" | "testimony";
  threshold: number | null;
  icon: string;
  reference: string;
  verseText: string;
}

export interface EarnedBadge extends Badge {
  earnedAt: string;
}

/** XP and badges (CLAUDE.md §7.6, D-071, D-072): the person's own, through RLS. */
export interface XpAndBadges {
  /** Settled by the queue's worker, so it can lag a check-in by a few seconds. */
  xp: number;
  earned: EarnedBadge[];
  /** The next free-day and check-in milestones not yet reached. */
  next: Badge[];
}

interface BadgeRow {
  slug: string;
  kind: Badge["kind"];
  threshold: number | null;
  icon: string;
  reference: string;
  verse_text: string;
  sort: number;
}

const toBadge = (b: BadgeRow): Badge => ({
  slug: b.slug,
  kind: b.kind,
  threshold: b.threshold,
  icon: b.icon,
  reference: b.reference,
  verseText: b.verse_text,
});

export const getMyXpAndBadges = cache(async (userId: string): Promise<XpAndBadges> => {
  const supabase = await createSupabaseServerClient();
  const [stats, all, mine] = await Promise.all([
    supabase.from("user_stats").select("xp").eq("user_id", userId).maybeSingle(),
    supabase.from("badges").select("slug, kind, threshold, icon, reference, verse_text, sort").order("sort"),
    supabase.from("user_badges").select("badge, earned_at").eq("user_id", userId),
  ]);
  if (all.error || mine.error || stats.error) {
    throw new Error(`badges: ${(all.error ?? mine.error ?? stats.error)?.message}`);
  }
  const earnedAt = new Map((mine.data ?? []).map((r) => [r.badge, r.earned_at]));
  const badges = (all.data ?? []) as BadgeRow[];
  const earned = badges
    .filter((b) => earnedAt.has(b.slug))
    .map((b) => ({ ...toBadge(b), earnedAt: earnedAt.get(b.slug) as string }))
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
  const next = (["free_days", "checkin_days"] as const).flatMap((kind) => {
    const first = badges.find((b) => b.kind === kind && !earnedAt.has(b.slug));
    return first ? [toBadge(first)] : [];
  });
  return { xp: stats.data?.xp ?? 0, earned, next };
});

/** Every badge, by slug (one read per request). */
export const getBadgeCatalog = cache(async (): Promise<Map<string, Badge>> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("badges")
    .select("slug, kind, threshold, icon, reference, verse_text, sort")
    .order("sort");
  if (error) throw new Error(`badges: ${error.message}`);
  return new Map(((data ?? []) as BadgeRow[]).map((b) => [b.slug, toBadge(b)]));
});
