/**
 * The encouragement wall's fixed lists and limits (CLAUDE.md §7.7, D-077).
 * Safe for client code. The database enforces the same values.
 */

/** What a member can post. Announcements are for owners and admins; milestone cards are posted by the app (6b). */
export const POST_KINDS = ["encouragement", "prayer_request", "testimony", "announcement"] as const;
export type PostKind = (typeof POST_KINDS)[number];
export type WallKind = PostKind | "milestone";

/** Wall filters, as links: everything, or one kind. */
export const WALL_FILTERS = ["all", "prayer_request", "testimony", "encouragement", "announcement"] as const;
export type WallFilter = (typeof WALL_FILTERS)[number];

export const REACTION_KINDS = ["pray", "heart", "fire", "strong", "dove"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REPORT_REASONS = ["unkind", "sexual", "hateful", "spam", "unsafe", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const SOCIAL_LIMITS = {
  postMax: 2000,
  commentMax: 500,
  reportNoteMax: 500,
  wallPageSize: 20,
  homePreview: 3,
} as const;

/** The four nudges anyone can send (§7.7); "pray for me" is sent from the slip page to a partner. */
export const NUDGE_KINDS = ["praying", "check_in", "got_this", "call_me"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number] | "pray_for_me";

/** Two active partners per person per group (owner, 2026-10-12, D-083). */
export const PARTNERS_MAX = 2;
