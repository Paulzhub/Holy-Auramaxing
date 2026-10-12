import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/features/auth";
import { getGroupMembers, GroupHeader, requireGroup } from "@/features/groups";
import { getMyPartnerships, PartnerPanel, SocialNotice } from "@/features/social";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupPartner") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Accountability partners in this group (CLAUDE.md §3, §7.7, D-083): my
 * partners and their alert choices, requests both ways, and asking someone.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId);
  const [{ profile }, query, partnerships, members, t] = await Promise.all([
    requireAccount(),
    searchParams,
    getMyPartnerships(groupId),
    getGroupMembers(groupId),
    getTranslations("social.partner"),
  ]);
  const candidates = members
    .filter((m) => m.status === "active" && m.userId !== ctx.userId)
    .map((m) => ({ userId: m.userId, name: m.name }));
  return (
    <>
      <GroupHeader ctx={ctx} current="partner" />
      <SocialNotice notice={query.notice} error={query.error} />
      <h2 className="profile-section__title">{t("title")}</h2>
      <PartnerPanel
        groupId={groupId}
        partnerships={partnerships}
        candidates={candidates}
        timeZone={profile.timezone}
        archived={Boolean(ctx.group.archivedAt)}
      />
    </>
  );
}
