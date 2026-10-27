import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ARTICLES, ArticlesHub, publicMetadata } from "@/features/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pages.articles");
  return publicMetadata({ title: t("title"), description: t("description"), path: "/articles" });
}

/** The hub exists only while an article is published (D-120). */
export default function Page() {
  if (ARTICLES.length === 0) notFound();
  return <ArticlesHub />;
}
