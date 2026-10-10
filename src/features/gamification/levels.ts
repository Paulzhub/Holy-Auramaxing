/**
 * Level rules as pure functions (CLAUDE.md §7.6). The database is the source
 * of truth (util.level_info, private.recompute_level); these mirror it for
 * tests and for places that format a level the database already returned.
 * levels.test.ts checks every level 0–1002 against data/levels.csv.
 */

export const LEVEL_VARIANTS = ["", "Lite", "Pro", "Max", "Ultra", "Ultra Pro Max"] as const;

/** Clean days needed to go from `level` to `level + 1`. */
export function daysToNext(level: number): number {
  return level + 1 <= 20 ? 5 : 10;
}

/** Free days from Level 0 to `level` without a break (levels.csv days_from_level_0). */
export function daysForLevel(level: number): number {
  return level <= 20 ? 5 * level : 100 + 10 * (level - 20);
}

/** The tier a level belongs to, before capping at the last named tier. */
export function tierNumber(level: number): number {
  return level <= 0 ? 0 : Math.floor((level - 1) / 6) + 1;
}

export function levelVariant(level: number): string {
  return level <= 0 ? "" : (LEVEL_VARIANTS[(level - 1) % 6] ?? "");
}

/**
 * "Name", "Name Lite" … "Name Ultra Pro Max". Past the last named tier the
 * last name continues with a number: "Well Done 2", "Well Done 2 Lite"…
 * `tierNames[0]` is "Clay" (Level 0).
 */
export function levelLabel(level: number, tierNames: readonly string[]): string {
  const safe = Math.max(0, Math.trunc(level));
  const last = tierNames.length - 1;
  const wanted = tierNumber(safe);
  const name = tierNames[Math.min(wanted, last)] ?? "";
  const number = wanted > last ? ` ${wanted - last + 1}` : "";
  return `${name}${number} ${levelVariant(safe)}`.trim();
}

export type ReplayDay = "clean" | "slipped" | "paused" | null;

/**
 * The reference replay (data/build_levels.py `replay`), for tests: a missed
 * day (null) costs exactly what a slip costs; a paused day costs nothing.
 */
export function replay(days: readonly ReplayDay[], penalty = 10): { level: number; progress: number; highest: number } {
  let level = 0;
  let progress = 0;
  let highest = 0;
  for (const day of days) {
    if (day === "clean") {
      progress += 1;
      if (progress >= daysToNext(level)) {
        level += 1;
        progress = 0;
        highest = Math.max(highest, level);
      }
    } else if (day !== "paused") {
      level = Math.max(0, level - penalty);
      progress = 0;
    }
  }
  return { level, progress, highest };
}
