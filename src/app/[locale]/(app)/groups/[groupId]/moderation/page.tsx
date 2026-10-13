import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/features/auth";
import { GroupHeader, requireGroup } from "@/features/groups";
import { getGroupReports, ModerationList, SocialNotice } from "@/features/social";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupModeration") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Reports for the group's owner and admins (CLAUDE.md §7.11, D-079): what was
 * reported and why, never who reported it, and never reports about the
 * reader. Members get a 404.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId, "admin");
  const timeZone = (await requireAccount()).profile.timezone;
  const query = await searchParams;
  const [t, reports] = await Promise.all([getTranslations("social.moderation"), getGroupReports(groupId)]);
  const viewer = { groupId, userId: ctx.userId, isAdmin: true, archived: Boolean(ctx.group.archivedAt), timeZone };
  return (
    <>
      <GroupHeader ctx={ctx} current="moderation" />
      <SocialNotice notice={query.notice} error={query.error} />
      <div className="stack">
        <h2 className="profile-section__title">{t("title")}</h2>
        <p className="page-lede">{t("lede")}</p>
        <ModerationList viewer={viewer} reports={reports} />
      </div>
    </>
  );
}
