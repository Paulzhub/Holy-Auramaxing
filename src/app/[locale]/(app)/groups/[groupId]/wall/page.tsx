import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/features/auth";
import { GroupHeader, requireGroup } from "@/features/groups";
import { getWall, parseWallQuery, SocialNotice, WallFilters, WallList } from "@/features/social";
import { PostComposer } from "@/features/social/ui";
import { clientMessages } from "@/i18n/client-messages";

// Tab titles never carry a group's name (§2.3, D-035).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupWall") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The group's encouragement wall (CLAUDE.md §7.7, D-077): a form to post,
 * filters as links, pinned announcements, then posts newest first, paged by
 * cursor. Server-rendered; the post form is the only client component.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId);
  const timeZone = (await requireAccount()).profile.timezone;
  const query = await searchParams;
  const { filter, before } = parseWallQuery(query);
  const [t, page, messages] = await Promise.all([
    getTranslations("social.wall"),
    getWall(groupId, filter, before),
    clientMessages(["social"]),
  ]);
  const archived = Boolean(ctx.group.archivedAt);
  const viewer = { groupId, userId: ctx.userId, isAdmin: ctx.isAdmin, archived, timeZone };

  return (
    <>
      <GroupHeader ctx={ctx} current="wall" />
      <SocialNotice notice={query.notice} error={query.error} />
      <div className="stack">
        <p className="page-lede">{t("lede")}</p>
        {archived ? (
          <p className="auth-banner" role="status">
            {t("archived")}
          </p>
        ) : (
          <section className="ui-card" aria-labelledby="wall-write">
            <h2 id="wall-write" className="ui-card__title">
              {t("homeWrite")}
            </h2>
            <NextIntlClientProvider messages={messages}>
              <PostComposer groupId={groupId} canAnnounce={ctx.isAdmin} />
            </NextIntlClientProvider>
          </section>
        )}
        <WallFilters groupId={groupId} filter={filter} />
        <NextIntlClientProvider messages={messages}>
          <WallList viewer={viewer} page={page} filter={filter} />
        </NextIntlClientProvider>
      </div>
    </>
  );
}
