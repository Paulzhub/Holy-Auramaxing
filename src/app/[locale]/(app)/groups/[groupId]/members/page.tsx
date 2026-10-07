import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getGroupMembers, GroupHeader, GroupNotice, MemberList, requireGroup } from "@/features/groups";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupMembers") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The member list, with roles, requests and removals (CLAUDE.md §7.4). */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId);
  const [members, query] = await Promise.all([getGroupMembers(groupId), searchParams]);
  return (
    <>
      <GroupHeader ctx={ctx} current="members" />
      <GroupNotice notice={query.notice} error={query.error} />
      <MemberList ctx={ctx} members={members} />
    </>
  );
}
