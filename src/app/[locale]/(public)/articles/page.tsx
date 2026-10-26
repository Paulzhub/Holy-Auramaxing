import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ArticlesHub, publicMetadata } from "@/features/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pages.articles");
  return publicMetadata({ title: t("title"), description: t("description"), path: "/articles" });
}

export default function Page() {
  return <ArticlesHub />;
}
