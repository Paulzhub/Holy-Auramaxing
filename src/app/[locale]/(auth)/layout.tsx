import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/shell/brand-mark";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { clientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import { getThemePreference } from "@/lib/server/theme";

// Sign-in and sign-up pages: useful to nobody in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const theme = await getThemePreference();
  // The sign-in and sign-up forms are client components that need the "auth" copy.
  const messages = await clientMessages(["auth"]);

  return (
    <>
      <a href="#main" className="skip-link visually-hidden">
        {t("shell.skipToContent")}
      </a>
      <div className="horizon" aria-hidden="true" />
      <header className="auth-header">
        <Link href="/" className="brand" aria-label={t("shell.homeLink", { app: t("app.name") })}>
          <BrandMark />
          <span aria-hidden="true">{t("app.name")}</span>
        </Link>
        <ThemeSwitcher initial={theme} />
      </header>
      <main id="main" className="auth-main" tabIndex={-1}>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </main>
      {/* Help and policies sit in the same place on every auth page (WCAG 3.2.6). */}
      <footer className="auth-footer">
        <nav aria-label={t("auth.footer.label")}>
          <ul>
            <li>
              <Link href="/privacy">{t("legal.privacy.short")}</Link>
            </li>
            <li>
              <Link href="/terms">{t("legal.terms.short")}</Link>
            </li>
            <li>
              <Link href="/your-data">{t("legal.yourData.short")}</Link>
            </li>
          </ul>
        </nav>
        <p className="text-muted">{t("auth.footer.notMedical")}</p>
      </footer>
    </>
  );
}
