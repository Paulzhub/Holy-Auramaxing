import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PAGE_SIZE, type Board, type GoalPeriod, type Period } from "../leaderboards";

/**
 * A group's boards and its Together total (CLAUDE.md §7.6, D-074, D-075).
 * The database decides who appears and with what (share levels, hiding,
 * closing accounts); names and photos come from profile_cards, so each
 * person's own privacy settings apply too.
 */

export interface BoardRow {
  place: number;
  /** Null for a hidden member, unless it's you or you're an owner or admin there (D-088); null for a block either way. */
  userId: string | null;
  name: string;
  avatarPath: string | null;
  score: number;
  isMe: boolean;
  /** Hidden from the board (the covenant allows it): place kept, name not shown. */
  hidden: boolean;
}

export interface BoardPage {
  rows: BoardRow[];
  /** My row, when it isn't on this page (null too when I'm not on this board at all). */
  me: BoardRow | null;
  /** There are places after this page. */
  hasMore: boolean;
}

export async function getLeaderboard(
  groupId: string,
  board: Board,
  period: Period,
  after = 0,
  limit = PAGE_SIZE,
): Promise<BoardPage> {
  const supabase = await createSupabaseServerClient();
  // One extra row tells us whether there is a next page.
  const { data, error } = await supabase.rpc("group_leaderboard", {
    p_group: groupId,
    p_board: board,
    p_period: period,
    p_after: after,
    p_limit: limit + 1,
  });
  if (error) throw new Error(`leaderboard: ${error.message}`);
  const raw = (data ?? []) as {
    place: number;
    member_id: string | null;
    score: number;
    is_me: boolean;
    is_hidden: boolean;
  }[];

  const ids = [...new Set(raw.map((r) => r.member_id).filter((id): id is string => Boolean(id)))];
  const { data: cards } = ids.length
    ? await supabase.from("profile_cards").select("id, handle, display_name, avatar_path").in("id", ids)
    : { data: [] };
  const byId = new Map((cards ?? []).map((c) => [c.id, c]));

  const toRow = (r: (typeof raw)[number]): BoardRow => {
    const card = r.member_id ? byId.get(r.member_id) : undefined;
    return {
      place: r.place,
      userId: r.member_id,
      name: card?.display_name || card?.handle || "",
      avatarPath: card?.avatar_path ?? null,
      score: r.score,
      isMe: r.is_me,
      hidden: r.is_hidden,
    };
  };

  const inPage = (place: number) => place > after && place <= after + limit;
  const rows = raw.filter((r) => inPage(r.place)).map(toRow);
  const mine = raw.find((r) => r.is_me);
  return {
    rows,
    me: mine && !inPage(mine.place) ? toRow(mine) : null,
    hasMore: raw.some((r) => r.place === after + limit + 1),
  };
}

export interface GroupGoal {
  period: GoalPeriod;
  target: number;
  progress: number;
  startsOn: string;
  endsOn: string;
}

export interface Together {
  freeDays: number;
  membersCounted: number;
  membersTotal: number;
  goal: GroupGoal | null;
}

interface TogetherJson {
  free_days: number;
  members_counted: number;
  members_total: number;
  goal: { period: GoalPeriod; target: number; progress: number; starts_on: string; ends_on: string } | null;
}

/** The group's free days together, counted only from members who share their streak or more (D-044, D-075). */
export const getTogether = cache(async (groupId: string): Promise<Together> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("group_together", { p_group: groupId });
  if (error || !data) throw new Error(`together: ${error?.message ?? "no data"}`);
  const t = data as unknown as TogetherJson;
  return {
    freeDays: Number(t.free_days),
    membersCounted: Number(t.members_counted),
    membersTotal: Number(t.members_total),
    goal: t.goal
      ? {
          period: t.goal.period,
          target: Number(t.goal.target),
          progress: Number(t.goal.progress),
          startsOn: t.goal.starts_on,
          endsOn: t.goal.ends_on,
        }
      : null,
  };
});
