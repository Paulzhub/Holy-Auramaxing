import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LegalPage } from "@/components/legal/legal-page";
import { publicMetadata } from "@/features/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  // Policy pages are public and indexable (CLAUDE.md §11, §12).
  return publicMetadata({ title: t("title"), description: t("lede"), path: "/privacy" });
}

export default function Page() {
  return (
    <div className="public-content">
      <LegalPage doc="privacy" />
    </div>
  );
}
