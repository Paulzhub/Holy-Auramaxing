import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { requireAccount } from "@/features/auth";
import { GroupHeader, requireGroup } from "@/features/groups";
import { CommentList, getPostWithComments, PostCard, SocialNotice } from "@/features/social";
import { CommentComposer } from "@/features/social/ui";
import { clientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupWall") };
}

type Params = Promise<{ groupId: string; postId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * One post with its comments. A post from another group, by someone blocked
 * either way, or deleted, is a 404, like an unknown id (D-034, D-078).
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId, postId } = await params;
  const ctx = await requireGroup(groupId);
  const timeZone = (await requireAccount()).profile.timezone;
  const query = await searchParams;
  const found = await getPostWithComments(postId);
  if (!found || found.groupId !== groupId) notFound();
  const [t, messages] = await Promise.all([getTranslations("social.post"), clientMessages(["social"])]);
  const archived = Boolean(ctx.group.archivedAt);
  const viewer = { groupId, userId: ctx.userId, isAdmin: ctx.isAdmin, archived, timeZone };

  return (
    <>
      <GroupHeader ctx={ctx} current="wall" />
      <SocialNotice notice={query.notice} error={query.error} />
      <div className="stack">
        <p>
          <Link href={`/groups/${groupId}/wall`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("back")}
          </Link>
        </p>
        <NextIntlClientProvider messages={messages}>
          <PostCard viewer={viewer} post={found.post} from="post" headingLevel={2} />
          <CommentList
            viewer={viewer}
            postId={postId}
            comments={found.comments}
            composer={archived ? null : <CommentComposer postId={postId} />}
          />
        </NextIntlClientProvider>
      </div>
    </>
  );
}
