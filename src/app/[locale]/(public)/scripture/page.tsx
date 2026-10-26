import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { publicMetadata, ScriptureHub } from "@/features/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pages.scripture");
  return publicMetadata({ title: t("title"), description: t("description"), path: "/scripture" });
}

export default function Page() {
  return <ScriptureHub />;
}
