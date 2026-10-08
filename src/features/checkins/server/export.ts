import type { ExportPart } from "@/lib/data-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { decryptNote } from "./queries";

/**
 * The check-ins part of "Download my data" (D-032): every check-in with its
 * private note decrypted (it is the person's own), their streaks and totals,
 * and their counts in each group's challenge. Read through RLS as the
 * signed-in person, so nothing about anyone else can be in it.
 */
export async function exportCheckinsData(userId: string): Promise<ExportPart> {
  const supabase = await createSupabaseServerClient();
  const [checkins, stats, groupStats] = await Promise.all([
    supabase
      .from("checkins")
      .select(
        "local_date, timezone, outcome, mood, urge_level, triggers, note_encrypted, edit_count, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("local_date", { ascending: true }),
    supabase
      .from("user_stats")
      .select(
        "current_streak, longest_streak, total_clean_days, total_checkins, checkin_streak, clean_streaks, last_checkin_date, last_clean_date, updated_at",
      )
      .eq("user_id", userId),
    supabase
      .from("group_member_stats")
      .select("group_id, clean_days_in_challenge, checkins_in_challenge, updated_at")
      .eq("user_id", userId),
  ]);
  for (const result of [checkins, stats, groupStats]) {
    if (result.error) throw new Error(`check-ins export: ${result.error.message}`);
  }
  const groupIds = (groupStats.data ?? []).map((g) => g.group_id);
  const { data: groups } = groupIds.length
    ? await supabase.from("groups").select("id, name").in("id", groupIds)
    : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((groups ?? []).map((g) => [g.id, g.name]));

  return {
    sections: [
      {
        name: "checkins",
        description:
          "Every daily check-in: the day (in your time zone), your answer, mood (1–5), urge strength (0–5), what you noted as triggers, and your private note, decrypted for you.",
        rows: (checkins.data ?? []).map((c) => ({
          date: c.local_date,
          time_zone: c.timezone,
          answer: c.outcome,
          mood: c.mood,
          urge_strength: c.urge_level,
          triggers: (c.triggers ?? []).join(" "),
          private_note: decryptNote(userId, c.local_date, c.note_encrypted),
          times_edited: c.edit_count,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })),
      },
      {
        name: "streaks",
        description: "Your streaks and totals as last calculated. The current streak here is as of your last check-in.",
        rows: (stats.data ?? []).map((s) => ({ ...s })),
      },
      {
        name: "group_challenge_counts",
        description: "Your clean days and check-ins inside each group's challenge.",
        rows: (groupStats.data ?? []).map((g) => ({
          group: nameOf.get(g.group_id) ?? g.group_id,
          clean_days_in_challenge: g.clean_days_in_challenge,
          checkins_in_challenge: g.checkins_in_challenge,
          updated_at: g.updated_at,
        })),
      },
    ],
    files: [],
  };
}
