import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/features/auth";
import { getGroupToday, GroupToday } from "@/features/checkins";
import { getLeaderboard, getTogether, LeaderboardPreview, PREVIEW_SIZE, TogetherCard } from "@/features/gamification";
import {
  CovenantSummary,
  GoalForm,
  getOpenProposal,
  GroupHeader,
  GroupHomeSkeleton,
  GroupNotice,
  ProposalCard,
  requireGroup,
} from "@/features/groups";
import { getWall, SOCIAL_LIMITS, WallHomeCard } from "@/features/social";

// Tab titles never carry a group's name, which could give away what the app is for (§2.3).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("group") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * A group's home (CLAUDE.md §7.4). Today's check-ins (Phase 4) at each
 * member's share level, the top of the leaderboard and the Together total
 * with the group goal (Phase 5c), and the wall's newest posts (Phase 6a).
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId);
  const timeZone = (await requireAccount()).profile.timezone;
  const [t, proposal, query, today, board, together, wall] = await Promise.all([
    getTranslations("groups"),
    getOpenProposal(ctx),
    searchParams,
    getGroupToday(groupId, ctx.userId),
    getLeaderboard(groupId, "xp", "all", 0, PREVIEW_SIZE),
    getTogether(groupId),
    getWall(groupId, "all", null, SOCIAL_LIMITS.homePreview),
  ]);
  const { group } = ctx;

  return (
    <>
      <GroupHeader ctx={ctx} current="home" />
      <GroupNotice notice={query.notice} error={query.error} />
      <div className="stack">
        {group.archivedAt ? (
          <p className="auth-banner" role="status">
            {t("home.archivedBanner")}
          </p>
        ) : null}
        {group.description ? <p className="group-description">{group.description}</p> : null}
        {proposal ? <ProposalCard ctx={ctx} proposal={proposal} /> : null}
        <GroupHomeSkeleton
          ctx={ctx}
          today={<GroupToday members={today} />}
          leaderboard={<LeaderboardPreview groupId={groupId} page={board} />}
          together={
            <TogetherCard together={together}>
              <GoalForm ctx={ctx} goal={together.goal} />
            </TogetherCard>
          }
          wall={
            <WallHomeCard
              viewer={{
                groupId,
                userId: ctx.userId,
                isAdmin: ctx.isAdmin,
                archived: Boolean(group.archivedAt),
                timeZone,
              }}
              page={wall}
            />
          }
        />
        <CovenantSummary
          text={group.covenantText}
          minShareLevel={group.minShareLevel}
          hidingAllowed={group.leaderboardHidingAllowed}
        />
      </div>
    </>
  );
}
