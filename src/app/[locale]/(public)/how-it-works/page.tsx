import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { HowItWorks, publicMetadata } from "@/features/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pages.howItWorks");
  return publicMetadata({ title: t("title"), description: t("description"), path: "/how-it-works" });
}

export default function Page() {
  return <HowItWorks />;
}
