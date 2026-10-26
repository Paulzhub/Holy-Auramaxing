import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/shell/brand-mark";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { buttonVariants } from "@/components/ui/button-variants";
import { Link } from "@/i18n/navigation";
import { getThemePreference } from "@/lib/server/theme";

const navLinks = [
  { href: "/how-it-works", key: "howItWorks" },
  { href: "/scripture", key: "scripture" },
  { href: "/articles", key: "articles" },
  { href: "/faq", key: "faq" },
] as const;

const footerLinks = [
  { href: "/about", key: "about" },
  { href: "/get-help", key: "getHelp" },
  { href: "/privacy", key: "privacy" },
  { href: "/terms", key: "terms" },
  { href: "/your-data", key: "yourData" },
  { href: "/community-guidelines", key: "communityGuidelines" },
  { href: "/accessibility", key: "accessibility" },
  { href: "/security", key: "security" },
] as const;

/**
 * The frame for the public website (CLAUDE.md §12, D-114): the same header,
 * help link and footer on every page (WCAG 3.2.3, 3.2.6). It never reads the
 * session, so every visitor gets the same page, and it never carries
 * `data-lockable`, so the app lock never covers it (D-113).
 *
 * On phones the links sit in a <details> disclosure, which works without
 * JavaScript.
 */
export async function PublicFrame({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const theme = await getThemePreference();

  const nav = (
    <ul className="public-nav__list">
      {navLinks.map((link) => (
        <li key={link.key}>
          <Link href={link.href} className="public-nav__link">
            {t(`marketing.nav.${link.key}`)}
          </Link>
        </li>
      ))}
      <li>
        <Link href="/sign-in" className="public-nav__link">
          {t("marketing.nav.signIn")}
        </Link>
      </li>
    </ul>
  );

  return (
    <>
      <a href="#main" className="skip-link visually-hidden">
        {t("shell.skipToContent")}
      </a>
      <div className="horizon" aria-hidden="true" />
      <header className="public-header">
        <Link href="/" className="brand" aria-label={t("shell.homeLink", { app: t("app.tabName") })}>
          <BrandMark />
          <span aria-hidden="true">{t("app.tabName")}</span>
        </Link>
        <nav aria-label={t("marketing.nav.label")} className="public-nav">
          <div className="public-nav__wide">{nav}</div>
          <details className="public-nav__menu">
            <summary className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("marketing.nav.menu")}
            </summary>
            <div className="public-nav__panel">{nav}</div>
          </details>
        </nav>
        <div className="public-header__end">
          <ThemeSwitcher initial={theme} />
          <Link href="/sign-up" className={`${buttonVariants({ size: "sm" })} public-header__start`}>
            {t("marketing.nav.start")}
          </Link>
        </div>
      </header>
      <main id="main" className="public-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="public-footer">
        <p className="public-footer__tagline">{t("marketing.footer.tagline")}</p>
        <nav aria-label={t("marketing.footer.label")}>
          <ul className="public-footer__links">
            {footerLinks.map((link) => (
              <li key={link.key}>
                <Link href={link.href}>
                  {link.key === "privacy" || link.key === "terms" || link.key === "yourData"
                    ? t(`legal.${link.key}.short`)
                    : t(`marketing.footer.${link.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-muted">{t("marketing.footer.notMedical")}</p>
        <p className="text-muted">{t("marketing.footer.translation")}</p>
      </footer>
    </>
  );
}
