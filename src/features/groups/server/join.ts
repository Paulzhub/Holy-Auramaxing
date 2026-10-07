import { NextResponse } from "next/server";

import { siteOrigin } from "@/lib/env";
import { consume } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request-info";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ChallengeType, JoinPolicy, ShareLevel } from "../constants";
import { hashInviteToken, isInviteToken } from "../invite-secrets";
import { encodeHeldInvite, INVITE_COOKIE, inviteCookieOptions, readHeldInvite } from "./invite-cookie";

export type InviteStatus = "valid" | "invalid" | "expired" | "revoked" | "used_up" | "full" | "archived";

export interface InvitePreview {
  status: InviteStatus;
  groupName: string | null;
  memberCount: number | null;
}

export interface InviteDetails extends InvitePreview {
  groupId: string | null;
  description: string | null;
  challengeType: ChallengeType | null;
  challengeDays: number | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  covenantText: string | null;
  covenantUpdatedAt: string | null;
  minShareLevel: ShareLevel | null;
  leaderboardHidingAllowed: boolean | null;
  joinPolicy: JoinPolicy | null;
  myStatus: "active" | "pending" | "removed" | null;
}

/**
 * GET /join/<token>: keeps the invite in an httpOnly cookie (as a hash) and
 * sends the browser to the clean /join page, so the token doesn't stay in
 * the address bar or history (D-037).
 */
export async function handleInviteLink(request: Request, token: string): Promise<Response> {
  const origin = siteOrigin(new URL(request.url).origin);
  const response = NextResponse.redirect(new URL("/join", origin), { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (!(await consume("invitePreviewByIp", await clientIp())).ok) return response;
  // Anything that isn't a token is simply dropped; /join then explains.
  if (isInviteToken(token)) {
    response.cookies.set(INVITE_COOKIE, encodeHeldInvite("token", hashInviteToken(token)), inviteCookieOptions);
  }
  return response;
}

/** What anyone holding the invite may see: the name and member count (§7.4). */
export async function previewHeldInvite(): Promise<InvitePreview | null> {
  const held = await readHeldInvite();
  if (!held) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .rpc("preview_group_invite", { p_token_hash: held.tokenHash ?? "", p_code_hash: held.codeHash ?? undefined })
    .maybeSingle();
  if (!data) return { status: "invalid", groupName: null, memberCount: null };
  return {
    status: data.status as InviteStatus,
    groupName: data.group_name,
    memberCount: data.member_count,
  };
}

/** For a signed-in person: the covenant and everything needed to decide. */
export async function detailsOfHeldInvite(): Promise<InviteDetails | null> {
  const held = await readHeldInvite();
  if (!held) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("group_invite_details", { p_token_hash: held.tokenHash ?? "", p_code_hash: held.codeHash ?? undefined })
    .maybeSingle();
  if (error || !data) return null;
  return {
    status: data.status as InviteStatus,
    groupId: data.group_id,
    groupName: data.group_name,
    memberCount: data.member_count,
    description: data.description,
    challengeType: data.challenge_type as ChallengeType | null,
    challengeDays: data.challenge_days,
    startDate: data.start_date,
    endDate: data.end_date,
    timezone: data.group_timezone,
    covenantText: data.covenant_text,
    covenantUpdatedAt: data.covenant_updated_at,
    minShareLevel: data.min_share_level as ShareLevel | null,
    leaderboardHidingAllowed: data.leaderboard_hiding_allowed,
    joinPolicy: data.join_policy as JoinPolicy | null,
    myStatus: data.my_status as InviteDetails["myStatus"],
  };
}
