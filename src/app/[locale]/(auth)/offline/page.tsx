import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { OfflineCheckinPage } from "@/features/pwa";
import { AppLock } from "@/features/recovery";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("offline") };
}

/**
 * Shown whenever a page can't load (CLAUDE.md §13; D-124). The service
 * worker keeps a copy of this page, fetched without cookies, so it holds
 * nobody's data: the check-in form reads who is signed in from this device.
 * The app lock (D-113) applies here too.
 */
export default async function Page() {
  const t = await getTranslations("pwa.offline");
  return (
    <>
      <div data-lockable className="lockable">
        <div className="auth-card offline-page">
          <h1 className="page-title">{t("title")}</h1>
          <p className="page-lede">{t("lede")}</p>
          <OfflineCheckinPage />
          <div className="profile-actions">
            <Link href="/breathe" className={buttonVariants({ variant: "secondary" })}>
              {t("breathe")}
            </Link>
            <Link href="/home" className={buttonVariants({ variant: "ghost" })}>
              {t("retry")}
            </Link>
          </div>
        </div>
      </div>
      <AppLock />
    </>
  );
}
