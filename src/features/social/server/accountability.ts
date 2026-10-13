import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { NudgeKind } from "../constants";

/**
 * Nudges and partners, as the signed-in person may see them (CLAUDE.md §7.7,
 * D-082, D-083). The database decides who appears (blocks, mutes, closing
 * accounts); names come from profile_cards.
 */

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function namesFor(
  supabase: Client,
  ids: string[],
): Promise<Map<string, { name: string; avatarPath: string | null }>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data } = await supabase
    .from("profile_cards")
    .select("id, handle, display_name, avatar_path")
    .in("id", unique);
  return new Map(
    (data ?? []).flatMap((c) =>
      c.id ? [[c.id, { name: c.display_name || c.handle || "", avatarPath: c.avatar_path }]] : [],
    ),
  );
}

/** Who I can nudge in this group right now: userId → whether I already nudged them today. */
export async function getNudgeTargets(groupId: string): Promise<Map<string, boolean>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("group_nudge_targets", { p_group: groupId });
  if (error) throw new Error(`nudge targets: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.user_id, r.sent_today]));
}

export interface ReceivedNudge {
  id: string;
  groupId: string;
  fromName: string | null;
  kind: NudgeKind;
  createdAt: string;
}

/** Nudges I received in the last three days (in one group, or all of mine). */
export async function getMyNudges(groupId: string | null): Promise<ReceivedNudge[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_nudges", { p_group: groupId as string });
  if (error) throw new Error(`nudges: ${error.message}`);
  const rows = data ?? [];
  const names = await namesFor(
    supabase,
    rows.map((r) => r.from_user),
  );
  return rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    fromName: names.get(r.from_user)?.name || null,
    kind: r.kind as NudgeKind,
    createdAt: r.created_at,
  }));
}

export interface Partnership {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerAvatarPath: string | null;
  askedByMe: boolean;
  status: "pending" | "active";
  iAllowAlerts: boolean;
  partnerAllowsAlerts: boolean;
  requestedAt: string;
  acceptedAt: string | null;
}

/** My partners and open requests in one group. */
export async function getMyPartnerships(groupId: string): Promise<Partnership[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_partnerships", { p_group: groupId });
  if (error) throw new Error(`partners: ${error.message}`);
  const rows = data ?? [];
  const names = await namesFor(
    supabase,
    rows.map((r) => r.partner_id),
  );
  return rows.map((r) => ({
    id: r.id,
    partnerId: r.partner_id,
    partnerName: names.get(r.partner_id)?.name ?? "",
    partnerAvatarPath: names.get(r.partner_id)?.avatarPath ?? null,
    askedByMe: r.asked_by_me,
    status: r.status as "pending" | "active",
    iAllowAlerts: r.i_allow_alerts,
    partnerAllowsAlerts: r.partner_allows_alerts,
    requestedAt: r.requested_at,
    acceptedAt: r.accepted_at,
  }));
}

export interface ActivePartner {
  groupId: string;
  partnerId: string;
  name: string;
}

/** My active partners in every group, for "ask my partner to pray". */
export async function getMyActivePartners(userId: string): Promise<ActivePartner[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("partnerships")
    .select("group_id, user_a, user_b")
    .eq("status", "active")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if (error) throw new Error(`partners: ${error.message}`);
  const rows = (data ?? []).map((r) => ({ groupId: r.group_id, partnerId: r.user_a === userId ? r.user_b : r.user_a }));
  const names = await namesFor(
    supabase,
    rows.map((r) => r.partnerId),
  );
  return rows.flatMap((r) => {
    const n = names.get(r.partnerId);
    return n ? [{ ...r, name: n.name }] : [];
  });
}

export interface SocialSettings {
  nudgesMuted: boolean;
  milestoneCards: boolean;
}

export async function getSocialSettings(userId: string): Promise<SocialSettings> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("privacy_settings")
    .select("nudges_muted, milestone_cards")
    .eq("user_id", userId)
    .maybeSingle();
  return { nudgesMuted: data?.nudges_muted ?? false, milestoneCards: data?.milestone_cards ?? true };
}

/** Whether I muted nudges in this group. */
export async function getGroupNudgesMuted(groupId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("group_members")
    .select("nudges_muted")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.nudges_muted ?? false;
}
