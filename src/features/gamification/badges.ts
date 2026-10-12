/**
 * Badge slugs (CLAUDE.md §7.6, D-072): the database seeds these, and the
 * messages name and describe each one. levels.test.ts checks both.
 */
export const BADGE_SLUGS = [
  "free_1",
  "free_3",
  "free_7",
  "free_14",
  "free_21",
  "free_30",
  "free_40",
  "free_60",
  "free_90",
  "free_180",
  "free_365",
  "checkin_7",
  "checkin_30",
  "checkin_100",
  "faithful_finisher",
  "encourager",
  "prayer_warrior",
  "first_testimony",
] as const;
