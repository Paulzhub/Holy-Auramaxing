import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import { ResourcesView } from "@/features/recovery";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("resources") };
}

/** Help for hard days (CLAUDE.md §7.9): crisis lines, filters, counsellors and books. */
export default async function Page() {
  const [{ profile }, t] = await Promise.all([requireAccount(), getTranslations("resources")]);
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <ResourcesView timeZone={profile.timezone} />
    </>
  );
}
