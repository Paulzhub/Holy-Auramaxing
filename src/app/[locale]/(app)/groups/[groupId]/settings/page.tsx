import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import {
  DangerZone,
  getGroupMembers,
  getOpenProposal,
  groupPictureUrl,
  GroupHeader,
  GroupNotice,
  LeaveGroupSection,
  ProposalCard,
  requireGroup,
} from "@/features/groups";
import {
  CovenantForm,
  GroupChallengeForm,
  GroupDetailsForm,
  GroupPictureEditor,
  MembershipForm,
} from "@/features/groups/ui-manage";
import { clientMessages } from "@/i18n/client-messages";
import { timezoneOptions } from "@/lib/timezones";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupSettings") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Settings: my own membership for everyone; name, description and picture
 * for owners and admins; the challenge, covenant, hand-over, archive and
 * delete for the owner (CLAUDE.md §3, §7.4).
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId);
  const { group } = ctx;
  const [t, query, messages, members, proposal] = await Promise.all([
    getTranslations("groups.settings"),
    searchParams,
    clientMessages(["groups"]),
    ctx.isOwner ? getGroupMembers(groupId) : Promise.resolve([]),
    ctx.isOwner ? getOpenProposal(ctx) : Promise.resolve(null),
  ]);
  const editable = !group.archivedAt;

  return (
    <>
      <GroupHeader ctx={ctx} current="settings" />
      <GroupNotice notice={query.notice} error={query.error} />
      <p className="page-lede">{t("lede")}</p>
      <NextIntlClientProvider messages={messages}>
        <div className="stack">
          <MembershipForm
            groupId={groupId}
            values={{ shareLevel: ctx.me.shareLevel, leaderboardHidden: ctx.me.leaderboardHidden }}
            minShareLevel={group.minShareLevel}
            hidingAllowed={group.leaderboardHidingAllowed}
          />
          {ctx.isAdmin && editable ? (
            <>
              <GroupPictureEditor
                groupId={groupId}
                name={group.name}
                src={groupPictureUrl(group.id, group.coverPath, "xl")}
                status={group.coverStatus}
                hasPending={Boolean(group.coverPendingPath)}
              />
              <GroupDetailsForm groupId={groupId} name={group.name} description={group.description ?? ""} />
            </>
          ) : null}
          {ctx.isOwner && editable ? (
            <>
              <GroupChallengeForm
                groupId={groupId}
                timezones={timezoneOptions(group.timezone)}
                values={{
                  challengeType: group.challengeType,
                  challengeDays: group.challengeDays,
                  startDate: group.startDate,
                  timezone: group.timezone,
                  maxMembers: group.maxMembers,
                  joinPolicy: group.joinPolicy,
                }}
              />
              {proposal ? <ProposalCard ctx={ctx} proposal={proposal} from="settings" /> : null}
              <CovenantForm
                groupId={groupId}
                values={{
                  covenant: group.covenantText,
                  minShareLevel: group.minShareLevel,
                  hidingAllowed: group.leaderboardHidingAllowed,
                }}
              />
            </>
          ) : null}
          <LeaveGroupSection ctx={ctx} />
          {ctx.isOwner ? <DangerZone ctx={ctx} members={members} error={query.error} /> : null}
        </div>
      </NextIntlClientProvider>
    </>
  );
}
