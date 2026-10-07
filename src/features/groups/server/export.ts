import type { ExportPart } from "@/lib/data-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { readGroupPicture } from "./picture";

/**
 * The groups module's part of "Download my data" (D-032): the person's own
 * memberships and requests, the settings of groups they own, the invites
 * they made (dates and counts only; the links and codes were never kept),
 * and their answers to covenant changes. Never anything about another
 * member. Read through RLS as the signed-in person.
 */
export async function exportGroupsData(userId: string): Promise<ExportPart> {
  const supabase = await createSupabaseServerClient();
  const [memberships, invites, agreements] = await Promise.all([
    supabase
      .from("group_members")
      .select(
        "role, status, share_level, leaderboard_hidden, covenant_accepted_at, requested_at, joined_at, groups!inner(id, name, owner_id, description, challenge_type, challenge_days, start_date, end_date, group_timezone, covenant_text, min_share_level, leaderboard_hiding_allowed, join_policy, max_members, cover_path, archived_at, created_at)",
      )
      .eq("user_id", userId),
    supabase
      .from("group_invites")
      .select("group_id, created_at, expires_at, max_uses, use_count, revoked_at")
      .eq("created_by", userId),
    supabase.from("group_covenant_agreements").select("group_id, agreed_at").eq("user_id", userId),
  ]);
  for (const result of [memberships, invites, agreements]) {
    if (result.error) throw new Error(`groups export: ${result.error.message}`);
  }

  const rows = memberships.data ?? [];
  const nameOf = new Map(rows.map((m) => [m.groups.id, m.groups.name]));
  const owned = rows.filter((m) => m.groups.owner_id === userId).map((m) => m.groups);

  const files: ExportPart["files"] = [];
  for (const g of owned) {
    if (!g.cover_path) continue;
    const picture = await readGroupPicture(g.cover_path);
    if (picture) {
      files.push({
        name: `group-${g.id}.webp`,
        description: `The picture of "${g.name}", a group you own.`,
        data: new Uint8Array(picture),
      });
    }
  }

  return {
    sections: [
      {
        name: "group_memberships",
        description: "The groups you belong to or asked to join, your role, and what you share with each.",
        rows: rows.map((m) => ({
          group: m.groups.name,
          role: m.role,
          status: m.status,
          share_level: m.share_level,
          hidden_from_leaderboard: m.leaderboard_hidden,
          covenant_accepted_at: m.covenant_accepted_at,
          requested_at: m.requested_at,
          joined_at: m.joined_at,
        })),
      },
      {
        name: "groups_owned",
        description: "The settings and covenant of the groups you own.",
        rows: owned.map((g) => ({
          name: g.name,
          description: g.description,
          challenge_type: g.challenge_type,
          challenge_days: g.challenge_days,
          start_date: g.start_date,
          end_date: g.end_date,
          time_zone: g.group_timezone,
          covenant: g.covenant_text,
          minimum_share_level: g.min_share_level,
          leaderboard_hiding_allowed: g.leaderboard_hiding_allowed,
          join_policy: g.join_policy,
          max_members: g.max_members,
          archived_at: g.archived_at,
          created_at: g.created_at,
        })),
      },
      {
        name: "group_invites_made",
        description: "Invites you made. The links and codes themselves were never stored.",
        rows: (invites.data ?? []).map((i) => ({
          group: nameOf.get(i.group_id) ?? null,
          created_at: i.created_at,
          expires_at: i.expires_at,
          max_uses: i.max_uses,
          times_used: i.use_count,
          stopped_at: i.revoked_at,
        })),
      },
      {
        name: "covenant_agreements",
        description: "Changes to a group's covenant that you agreed to.",
        rows: (agreements.data ?? []).map((a) => ({ group: nameOf.get(a.group_id) ?? null, agreed_at: a.agreed_at })),
      },
    ],
    files,
  };
}
