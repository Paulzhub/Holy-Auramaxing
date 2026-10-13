import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import { getNotifications, NotificationCentre, NotificationNotice, parseCursor } from "@/features/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("alerts") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The notification centre (CLAUDE.md §7.8, D-089): newest first, 30 at a time. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ profile }, query, t] = await Promise.all([requireAccount(), searchParams, getTranslations("pages.alerts")]);
  const page = await getNotifications(parseCursor(query.before, query.id));
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <NotificationNotice notice={query.notice} error={query.error} />
      <NotificationCentre page={page} timeZone={profile.timezone} />
    </>
  );
}
