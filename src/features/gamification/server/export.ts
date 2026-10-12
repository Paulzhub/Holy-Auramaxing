import type { ExportPart } from "@/lib/data-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The XP and badges part of "Download my data" (D-032, D-071, D-072): every
 * XP row, corrections included, and every badge with the day it was earned.
 * Read through RLS as the signed-in person. Group names are looked up
 * separately (the person may have left; then the id stays).
 */
export async function exportGamificationData(userId: string): Promise<ExportPart> {
  const supabase = await createSupabaseServerClient();
  const [xp, badges] = await Promise.all([
    supabase
      .from("xp_ledger")
      .select("local_date, reason, kind, points, group_id, created_at")
      .eq("user_id", userId)
      .order("local_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("user_badges").select("badge, earned_at").eq("user_id", userId).order("earned_at"),
  ]);
  for (const result of [xp, badges]) {
    if (result.error) throw new Error(`gamification export: ${result.error.message}`);
  }
  const groupIds = [...new Set((xp.data ?? []).flatMap((x) => (x.group_id ? [x.group_id] : [])))];
  const { data: groups } = groupIds.length
    ? await supabase.from("groups").select("id, name").in("id", groupIds)
    : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((groups ?? []).map((g) => [g.id, g.name]));

  return {
    sections: [
      {
        name: "xp",
        description:
          "Every XP entry: the day it was for, why (check-in, days-in-a-row bonus, encouragement, devotional, finishing a group's challenge) and the points. A correction is a separate entry that cancels an earlier one.",
        rows: (xp.data ?? []).map((x) => ({
          date: x.local_date,
          // Plain words: the export never says "streak" (D-032).
          reason: x.reason === "checkin_streak" ? "days_in_a_row_bonus" : x.reason,
          entry: x.kind,
          points: x.points,
          group: x.group_id ? (nameOf.get(x.group_id) ?? x.group_id) : "",
          created_at: x.created_at,
        })),
      },
      {
        name: "badges",
        description: "Every badge you have earned and when.",
        rows: (badges.data ?? []).map((b) => ({ badge: b.badge, earned_at: b.earned_at })),
      },
    ],
    files: [],
  };
}
