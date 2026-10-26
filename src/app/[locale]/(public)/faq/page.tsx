import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Faq, publicMetadata } from "@/features/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pages.faq");
  return publicMetadata({ title: t("title"), description: t("description"), path: "/faq" });
}

export default function Page() {
  return <Faq />;
}
