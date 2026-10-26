import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs, PageIntro, publicMetadata } from "@/features/marketing";
import { ResourcesView } from "@/features/recovery";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pages.getHelp");
  return publicMetadata({ title: t("title"), description: t("description"), path: "/get-help" });
}

/** Help without an account (§7.9, §12, D-117): crisis lines, counsellors, safer devices. */
export default async function Page() {
  const t = await getTranslations("marketing.getHelp");
  return (
    <div className="public-content">
      <Breadcrumbs trail={[{ name: t("title"), path: "/get-help" }]} />
      <PageIntro title={t("title")} lede={t("lede")} />
      <ResourcesView timeZone={null} audience="public" />
    </div>
  );
}
