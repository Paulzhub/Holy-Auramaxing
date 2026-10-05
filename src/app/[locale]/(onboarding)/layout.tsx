import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/shell/brand-mark";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { requireAccount } from "@/features/auth";
import { SkipSetupButton } from "@/features/profile";
import { clientMessages } from "@/i18n/client-messages";
import { redirect } from "@/i18n/navigation";
import { getThemePreference } from "@/lib/server/theme";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/** Onboarding (CLAUDE.md §7.2): a calm, focused layout without the app's navigation. */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const account = await requireAccount();
  if (account.profile.onboarded_at) redirect({ href: "/home", locale: await getLocale() });

  const t = await getTranslations();
  const theme = await getThemePreference();
  const messages = await clientMessages(["onboarding"]);

  return (
    <>
      <a href="#main" className="skip-link visually-hidden">
        {t("shell.skipToContent")}
      </a>
      <div className="horizon" aria-hidden="true" />
      <header className="auth-header">
        <span className="brand">
          <BrandMark />
          <span>{t("app.name")}</span>
        </span>
        <div className="onboarding-header__actions">
          <ThemeSwitcher initial={theme} />
          <SkipSetupButton />
        </div>
      </header>
      <main id="main" className="auth-main" tabIndex={-1}>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </main>
    </>
  );
}
