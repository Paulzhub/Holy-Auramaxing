/**
 * Plain values shared by the check-in server code and its client parts.
 * No Zod here: client components import this file (D-010, D-026).
 */

/** The fixed trigger list (CLAUDE.md §7.5), in display order. Matches util.checkin_triggers(). */
export const TRIGGERS = [
  "bored",
  "lonely",
  "stressed",
  "tired",
  "late_night",
  "alone_with_phone",
  "social_media",
  "other",
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const OUTCOMES = ["clean", "slipped"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const MOODS = [1, 2, 3, 4, 5] as const;
export const URGE_LEVELS = [0, 1, 2, 3, 4, 5] as const;

/** The private note and the slip reflection, in characters. */
export const NOTE_MAX = 1000;

/** How far back the charts look by default, and the choices offered. */
export const CHART_RANGES = [30, 90] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
