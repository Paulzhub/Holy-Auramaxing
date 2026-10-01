import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandMark } from "@/components/shell/brand-mark";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { buttonVariants } from "@/components/ui/button-variants";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getThemePreference } from "@/lib/server/theme";

// Placeholder public landing page. Phase 9 replaces it with the scroll story.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "app",
  });
  return {
    title: { absolute: t("tabName") },
    description: t("description"),
    alternates: { canonical: "/" },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(hasLocale(routing.locales, locale) ? locale : routing.defaultLocale);
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");
  const theme = await getThemePreference();

  return (
    <>
      <div className="horizon" aria-hidden="true" />
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <span className="brand">
          <BrandMark />
          {tApp("name")}
        </span>
        <ThemeSwitcher initial={theme} />
      </header>
      <main id="main" className="landing">
        <h1 className="landing__title">{t("title")}</h1>
        <p className="page-lede">{t("lede")}</p>
        <p className="landing__grace">{t("graceLine")}</p>
        <Link href="/home" className={buttonVariants({ size: "lg" })}>
          {t("cta")}
        </Link>
      </main>
    </>
  );
}
