import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { getGroupInvites, GroupHeader, GroupNotice, requireGroup } from "@/features/groups";
import { InviteManager } from "@/features/groups/ui-invites";
import { clientMessages } from "@/i18n/client-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupInvites") };
}

type Params = Promise<{ groupId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Invites by link, code and QR code, for owners and admins (CLAUDE.md §7.4, D-037). */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId } = await params;
  const ctx = await requireGroup(groupId, "admin");
  const [t, invites, query, messages] = await Promise.all([
    getTranslations("groups.invites"),
    getGroupInvites(groupId),
    searchParams,
    clientMessages(["groups"]),
  ]);
  return (
    <>
      <GroupHeader ctx={ctx} current="invites" />
      <GroupNotice notice={query.notice} error={query.error} />
      <p className="page-lede">{t("lede")}</p>
      <NextIntlClientProvider messages={messages}>
        <InviteManager groupId={groupId} invites={invites} archived={Boolean(ctx.group.archivedAt)} />
      </NextIntlClientProvider>
    </>
  );
}
