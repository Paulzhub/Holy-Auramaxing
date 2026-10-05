import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LegalPage } from "@/components/legal/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return {
    title: t("title"),
    description: t("lede"),
    alternates: { canonical: "/privacy" },
    // Policy pages are public and indexable (CLAUDE.md §12).
    robots: { index: true, follow: true },
  };
}

export default function Page() {
  return <LegalPage doc="privacy" />;
}
