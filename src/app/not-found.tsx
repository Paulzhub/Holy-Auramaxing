import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { routing } from "@/i18n/routing";

import "./globals.css";

// Requests that never reach a locale (for example a missing file) land here.
export default async function RootNotFound() {
  const t = await getTranslations({ locale: routing.defaultLocale });
  return (
    <html lang={routing.defaultLocale}>
      <body>
        <title>{t("meta.titleTemplate", { page: t("meta.notFound"), app: t("app.tabName") })}</title>
        <main className="status-page">
          <h1 className="page-title">{t("errors.notFoundTitle")}</h1>
          <p className="page-lede">{t("errors.notFoundBody")}</p>
          <Link className="ui-button ui-button--primary" href="/home">
            {t("errors.goHome")}
          </Link>
        </main>
      </body>
    </html>
  );
}
