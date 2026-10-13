import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { UnsubscribeView } from "@/features/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("unsubscribe"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** "Stop these emails" from a notification email (RFC 8058's page for people, D-092). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <UnsubscribeView params={await searchParams} />;
}
