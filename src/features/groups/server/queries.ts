import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";

import { requireAccount } from "@/features/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ChallengeType, GroupRole, JoinPolicy, MemberStatus, ShareLevel } from "../constants";
import { groupPictureUrl, type GroupPictureSize } from "../picture-url";
import { uuidSchema } from "../schemas";
import { screenPendingGroupPicture } from "./picture";

/**
 * Reads for the groups pages. Every query runs as the signed-in person
 * through RLS (CLAUDE.md §5), so a page can only ever show rows of groups
 * they belong to; requireGroup() also 404s for anything else.
 */

export interface Group {
  id: string;
  name: string;
  description: string | null;
  coverPath: string | null;
  coverPendingPath: string | null;
  coverStatus: "none" | "pending_review" | "ready" | "rejected";
  ownerId: string;
  challengeType: ChallengeType;
  challengeDays: number | null;
  startDate: string;
  endDate: string | null;
  timezone: string;
  covenantText: string;
  covenantUpdatedAt: string;
  minShareLevel: ShareLevel;
  leaderboardHidingAllowed: boolean;
  joinPolicy: JoinPolicy;
  maxMembers: number;
  memberCount: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface MyMembership {
  role: GroupRole;
  status: MemberStatus;
  shareLevel: ShareLevel;
  leaderboardHidden: boolean;
  joinedAt: string | null;
}

export interface GroupContext {
  userId: string;
  group: Group;
  me: MyMembership & { status: "active" };
  isAdmin: boolean;
  isOwner: boolean;
}

const GROUP_COLUMNS =
  "id, name, description, cover_path, cover_pending_path, cover_status, owner_id, challenge_type, challenge_days, start_date, end_date, group_timezone, covenant_text, covenant_updated_at, min_share_level, leaderboard_hiding_allowed, join_policy, max_members, member_count, archived_at, created_at";

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  cover_path: string | null;
  cover_pending_path: string | null;
  cover_status: string;
  owner_id: string;
  challenge_type: string;
  challenge_days: number | null;
  start_date: string;
  end_date: string | null;
  group_timezone: string;
  covenant_text: string;
  covenant_updated_at: string;
  min_share_level: string;
  leaderboard_hiding_allowed: boolean;
  join_policy: string;
  max_members: number;
  member_count: number;
  archived_at: string | null;
  created_at: string;
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    coverPath: row.cover_path,
    coverPendingPath: row.cover_pending_path,
    coverStatus: row.cover_status as Group["coverStatus"],
    ownerId: row.owner_id,
    challengeType: row.challenge_type as ChallengeType,
    challengeDays: row.challenge_days,
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: row.group_timezone,
    covenantText: row.covenant_text,
    covenantUpdatedAt: row.covenant_updated_at,
    minShareLevel: row.min_share_level as ShareLevel,
    leaderboardHidingAllowed: row.leaderboard_hiding_allowed,
    joinPolicy: row.join_policy as JoinPolicy,
    maxMembers: row.max_members,
    memberCount: row.member_count,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

export function pictureOf(group: Pick<Group, "id" | "coverPath">, size: GroupPictureSize): string | undefined {
  return groupPictureUrl(group.id, group.coverPath, size);
}

/**
 * The group and the signed-in person's place in it, or a 404. A group
 * someone isn't an active member of looks exactly like one that doesn't
 * exist. `need` limits a page to admins or the owner.
 */
export const requireGroup = cache(
  async (groupId: string, need: "member" | "admin" | "owner" = "member"): Promise<GroupContext> => {
    const { userId } = await requireAccount();
    if (!uuidSchema.safeParse(groupId).success) notFound();
    const supabase = await createSupabaseServerClient();
    const [{ data: row }, { data: me }] = await Promise.all([
      supabase.from("groups").select(GROUP_COLUMNS).eq("id", groupId).maybeSingle<GroupRow>(),
      supabase
        .from("group_members")
        .select("role, status, share_level, leaderboard_hidden, joined_at")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (!row || !me || me.status !== "active") notFound();
    const role = me.role as GroupRole;
    const isOwner = role === "owner";
    const isAdmin = isOwner || role === "admin";
    if ((need === "admin" && !isAdmin) || (need === "owner" && !isOwner)) notFound();

    const group = toGroup(row);
    // A picture still waiting (e.g. after a screening outage) gets another
    // try whenever an admin opens the group.
    if (isAdmin && group.coverPendingPath) after(() => screenPendingGroupPicture(group.id));

    return {
      userId,
      group,
      me: {
        role,
        status: "active",
        shareLevel: me.share_level as ShareLevel,
        leaderboardHidden: me.leaderboard_hidden,
        joinedAt: me.joined_at,
      },
      isAdmin,
      isOwner,
    };
  },
);

export interface MyGroupItem {
  id: string;
  name: string;
  role: GroupRole;
  status: "active" | "pending";
  memberCount: number;
  pictureUrl?: string;
  startDate: string;
  endDate: string | null;
  timezone: string;
  archivedAt: string | null;
}

/** Every group I'm in or have asked to join, for /groups and the switcher. */
export const getMyGroups = cache(async (userId: string): Promise<MyGroupItem[]> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("group_members")
    .select(
      "role, status, groups!inner(id, name, cover_path, member_count, start_date, end_date, group_timezone, archived_at)",
    )
    .eq("user_id", userId)
    .in("status", ["active", "pending"])
    .order("requested_at", { ascending: true });
  return (data ?? []).map((row) => {
    const g = row.groups;
    return {
      id: g.id,
      name: g.name,
      role: row.role as GroupRole,
      status: row.status as "active" | "pending",
      memberCount: g.member_count,
      pictureUrl: groupPictureUrl(g.id, g.cover_path, "sm"),
      startDate: g.start_date,
      endDate: g.end_date,
      timezone: g.group_timezone,
      archivedAt: g.archived_at,
    };
  });
});

export interface MemberCard {
  userId: string;
  name: string;
  handle: string | null;
  avatarPath: string | null;
  role: GroupRole;
  status: MemberStatus;
  joinedAt: string | null;
  requestedAt: string;
}

/**
 * The group's people, as the signed-in person may see them: active
 * members for everyone; requests and removals for admins (RLS decides).
 * Names and photos come from profile_cards, so each person's own privacy
 * settings apply, and closing accounts are hidden (D-033).
 */
export async function getGroupMembers(groupId: string): Promise<MemberCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("group_members")
    .select("user_id, role, status, joined_at, requested_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true, nullsFirst: false })
    .order("requested_at", { ascending: true });
  if (!rows?.length) return [];
  const { data: cards } = await supabase
    .from("profile_cards")
    .select("id, handle, display_name, avatar_path")
    .in(
      "id",
      rows.map((r) => r.user_id),
    );
  const byId = new Map((cards ?? []).map((c) => [c.id, c]));
  return rows.flatMap((r) => {
    const card = byId.get(r.user_id);
    // No card: the account is closing or gone (or hidden from this viewer).
    if (!card?.id) return [];
    return [
      {
        userId: r.user_id,
        name: card.display_name ?? card.handle ?? "",
        handle: card.handle,
        avatarPath: card.avatar_path,
        role: r.role as GroupRole,
        status: r.status as MemberStatus,
        joinedAt: r.joined_at,
        requestedAt: r.requested_at,
      },
    ];
  });
}

export interface InviteSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  state: "active" | "expired" | "revoked" | "used_up";
}

/** The group's invites, for its admins (RLS shows them to nobody else). */
export async function getGroupInvites(groupId: string, now = new Date()): Promise<InviteSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("group_invites")
    .select("id, created_at, expires_at, max_uses, use_count, revoked_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((i) => ({
    id: i.id,
    createdAt: i.created_at,
    expiresAt: i.expires_at,
    maxUses: i.max_uses,
    useCount: i.use_count,
    revokedAt: i.revoked_at,
    state: i.revoked_at
      ? "revoked"
      : new Date(i.expires_at) <= now
        ? "expired"
        : i.max_uses !== null && i.use_count >= i.max_uses
          ? "used_up"
          : "active",
  }));
}

export interface OpenProposal {
  id: string;
  covenantText: string;
  minShareLevel: ShareLevel;
  leaderboardHidingAllowed: boolean;
  expiresAt: string;
  agreed: number;
  needed: number;
  iAgreed: boolean;
}

/** The open covenant change, if any, and how many members have agreed. */
export async function getOpenProposal(ctx: GroupContext): Promise<OpenProposal | null> {
  const supabase = await createSupabaseServerClient();
  const { data: p } = await supabase
    .from("group_covenant_proposals")
    .select("id, covenant_text, min_share_level, leaderboard_hiding_allowed, expires_at")
    .eq("group_id", ctx.group.id)
    .is("closed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!p) return null;
  const [{ data: agreements }, members] = await Promise.all([
    supabase.from("group_covenant_agreements").select("user_id").eq("proposal_id", p.id),
    getGroupMembers(ctx.group.id),
  ]);
  const others = members.filter((m) => m.status === "active" && m.role !== "owner").map((m) => m.userId);
  const agreedIds = new Set((agreements ?? []).map((a) => a.user_id));
  return {
    id: p.id,
    covenantText: p.covenant_text,
    minShareLevel: p.min_share_level as ShareLevel,
    leaderboardHidingAllowed: p.leaderboard_hiding_allowed,
    expiresAt: p.expires_at,
    agreed: others.filter((id) => agreedIds.has(id)).length,
    needed: others.length,
    iAgreed: agreedIds.has(ctx.userId),
  };
}
