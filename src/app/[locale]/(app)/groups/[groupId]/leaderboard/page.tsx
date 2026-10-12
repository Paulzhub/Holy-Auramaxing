import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getLeaderboard, LeaderboardBoard, parseBoardQuery } from "@/features/gamification";
import { GroupHeader, GroupNotice, requireGroup } from "@/features/groups";

// Tab titles never carry a group's name (§2.3, D-035).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupLeaderboard") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * A group's leaderboards (CLAUDE.md §7.6, D-074): Consistency XP (default),
 * Level, Current streak, Free days this challenge and Encourager, this week
 * or all time. Server-rendered; the tabs are links.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId);
  const query = await searchParams;
  const { board, period, after } = parseBoardQuery(query);
  const page = await getLeaderboard(groupId, board, period, after);
  return (
    <>
      <GroupHeader ctx={ctx} current="leaderboard" />
      <GroupNotice notice={query.notice} error={query.error} />
      <LeaderboardBoard groupId={groupId} board={board} period={period} after={after} page={page} />
    </>
  );
}
