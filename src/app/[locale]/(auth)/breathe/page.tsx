import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SosOffline } from "@/features/recovery";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("breathe") };
}

/**
 * The SOS tools without an account or a connection (CLAUDE.md §7.9, D-106).
 * The service worker keeps a copy of this page and shows it whenever a page
 * can't load offline. It holds nobody's data, so it is safe to keep.
 */
export default async function Page() {
  const t = await getTranslations("sos.offlinePage");
  return (
    <div className="auth-card sos-page">
      <h1 className="page-title">{t("title")}</h1>
      <p className="page-lede">{t("lede")}</p>
      <SosOffline />
      <p>
        <Link href="/home" className="text-link">
          {t("home")}
        </Link>
      </p>
    </div>
  );
}
