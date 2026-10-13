import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/features/auth";
import { getGroupMembers, GroupHeader, GroupNotice, MemberList, requireGroup } from "@/features/groups";
import { MemberSafetyTools, SocialNotice } from "@/features/social";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupMembers") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The member list, with roles, requests and removals (CLAUDE.md §7.4), and
 * report and block for each other member (§7.11, D-078, D-079).
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId);
  const timeZone = (await requireAccount()).profile.timezone;
  const [members, query] = await Promise.all([getGroupMembers(groupId), searchParams]);
  const viewer = {
    groupId,
    userId: ctx.userId,
    isAdmin: ctx.isAdmin,
    archived: Boolean(ctx.group.archivedAt),
    timeZone,
  };
  return (
    <>
      <GroupHeader ctx={ctx} current="members" />
      <GroupNotice notice={query.notice} error={query.error} />
      <SocialNotice notice={query.notice} error={query.error} />
      <MemberList
        ctx={ctx}
        members={members}
        memberTools={(m) => <MemberSafetyTools viewer={viewer} userId={m.userId} name={m.name} />}
      />
    </>
  );
}
