import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { About, publicMetadata } from "@/features/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pages.about");
  return publicMetadata({ title: t("title"), description: t("description"), path: "/about" });
}

export default function Page() {
  return <About />;
}
