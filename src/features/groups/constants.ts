/**
 * Groups: shared constants. Safe for client and server code (no Zod here,
 * D-010). Keep these equal to the checks in the groups migrations.
 */

export const SHARE_LEVELS = ["checkin_only", "streak", "full"] as const;
export type ShareLevel = (typeof SHARE_LEVELS)[number];

export const CHALLENGE_TYPES = ["30", "40", "60", "90", "custom", "ongoing"] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

export const JOIN_POLICIES = ["invite_only", "request_to_join"] as const;
export type JoinPolicy = (typeof JOIN_POLICIES)[number];

export type GroupRole = "owner" | "admin" | "member";
export type MemberStatus = "active" | "pending" | "removed";

export const GROUP_LIMITS = {
  nameMin: 3,
  nameMax: 60,
  descriptionMax: 500,
  covenantMin: 10,
  covenantMax: 2000,
  customDaysMin: 7,
  customDaysMax: 365,
  membersMin: 2,
  membersMax: 500,
  membersDefault: 50,
} as const;

export const INVITE_LIMITS = {
  /** Choices offered for how long an invite works, in days. */
  expiryChoices: [1, 3, 7, 14, 30] as const,
  expiryDefault: 7,
  maxUsesMax: 500,
} as const;

/** How much a share level reveals, for comparing against the covenant's minimum. */
export function shareRank(level: ShareLevel): number {
  return SHARE_LEVELS.indexOf(level);
}

/** The share levels a member may choose in a group with this minimum. */
export function allowedShareLevels(min: ShareLevel): ShareLevel[] {
  return SHARE_LEVELS.filter((level) => shareRank(level) >= shareRank(min));
}

export function isShareLevel(value: unknown): value is ShareLevel {
  return typeof value === "string" && (SHARE_LEVELS as readonly string[]).includes(value);
}
