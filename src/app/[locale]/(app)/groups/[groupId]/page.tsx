import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  CovenantSummary,
  getOpenProposal,
  GroupHeader,
  GroupHomeSkeleton,
  GroupNotice,
  ProposalCard,
  requireGroup,
} from "@/features/groups";

// Tab titles never carry a group's name, which could give away what the app is for (§2.3).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("group") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A group's home (CLAUDE.md §7.4). Check-ins, leaderboard and wall arrive in Phases 4 and 5. */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId);
  const [t, proposal, query] = await Promise.all([getTranslations("groups"), getOpenProposal(ctx), searchParams]);
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
        <GroupHomeSkeleton ctx={ctx} />
        <CovenantSummary
          text={group.covenantText}
          minShareLevel={group.minShareLevel}
          hidingAllowed={group.leaderboardHidingAllowed}
        />
      </div>
    </>
  );
}
