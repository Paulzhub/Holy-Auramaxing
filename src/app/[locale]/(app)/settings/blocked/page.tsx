import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import { BlockedList, getBlockedPeople, SocialNotice } from "@/features/social";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("blocked") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The people I've blocked, with Unblock (D-078). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireAccount();
  const [t, query, people] = await Promise.all([getTranslations("social.block"), searchParams, getBlockedPeople()]);
  return (
    <>
      <PageHeader title={t("listTitle")} lede={t("listLede")} />
      <SocialNotice notice={query.notice} error={query.error} />
      <BlockedList people={people} timeZone={profile.timezone} />
    </>
  );
}
