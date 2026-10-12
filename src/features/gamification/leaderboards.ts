/**
 * Leaderboards: which boards and views exist, and reading them from a URL
 * (CLAUDE.md §7.6, D-074). Pure, so Vitest can import it.
 */

export const BOARDS = ["xp", "level", "streak", "free_days", "encourager"] as const;
export type Board = (typeof BOARDS)[number];

export const PERIODS = ["all", "week"] as const;
export type Period = (typeof PERIODS)[number];

/** Level and Current streak are "right now"; a weekly view of them means little (owner, 2026-10-12). */
export function boardHasWeek(board: Board): boolean {
  return board === "xp" || board === "free_days" || board === "encourager";
}

/** The boards a checkin_only member appears on: the others would show a slip. */
export function boardShowsEveryone(board: Board): boolean {
  return board === "xp" || board === "encourager";
}

export const PAGE_SIZE = 50;
export const PREVIEW_SIZE = 5;
/** The deepest page we serve (5,000 members / 50), so a crafted ?after= can't ask for much. */
export const MAX_AFTER = 10_000;

type Query = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads ?board=, ?period= and ?after= safely: anything unknown falls back to the default. */
export function parseBoardQuery(query: Query): { board: Board; period: Period; after: number } {
  const b = first(query.board);
  const p = first(query.period);
  const board: Board = (BOARDS as readonly string[]).includes(b ?? "") ? (b as Board) : "xp";
  const period: Period = p === "week" && boardHasWeek(board) ? "week" : "all";
  const a = Number.parseInt(first(query.after) ?? "", 10);
  const after = Number.isFinite(a) && a > 0 && a <= MAX_AFTER ? a - (a % PAGE_SIZE) : 0;
  return { board, period, after };
}

/** The URL of a board view, without defaults. */
export function boardHref(groupId: string, board: Board, period: Period = "all", after = 0): string {
  const params = new URLSearchParams();
  if (board !== "xp") params.set("board", board);
  if (period === "week" && boardHasWeek(board)) params.set("period", "week");
  if (after > 0) params.set("after", String(after));
  const qs = params.toString();
  return `/groups/${groupId}/leaderboard${qs ? `?${qs}` : ""}`;
}

/** A group goal's period (the groups module owns the goal itself: GOAL_PERIODS there). */
export type GoalPeriod = "week" | "month" | "quarter" | "year";

/** Whole-number percentage for the goal bar, 0–100. */
export function goalPercent(progress: number, target: number): number {
  if (!(target > 0) || !(progress > 0)) return 0;
  return Math.min(100, Math.floor((progress / target) * 100));
}
