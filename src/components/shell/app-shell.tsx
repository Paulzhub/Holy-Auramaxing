import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import { SosButton } from "@/features/recovery";
import { Link } from "@/i18n/navigation";
import type { ThemePreference } from "@/lib/theme/theme";

import { BrandMark } from "./brand-mark";
import { BottomNav, SidebarNav } from "./primary-nav";
import { ThemeSwitcher } from "./theme-switcher";

function Brand() {
  const t = useTranslations();
  return (
    <Link href="/home" className="brand" aria-label={t("shell.homeLink", { app: t("app.name") })}>
      <BrandMark />
      <span aria-hidden="true">{t("app.name")}</span>
    </Link>
  );
}

export function AppShell({ children, theme }: { children: ReactNode; theme: ThemePreference }) {
  const t = useTranslations();

  return (
    <ToastProvider regionLabel={t("ui.toastRegion")} dismissLabel={t("ui.dismiss")}>
      <a href="#main" className="skip-link visually-hidden">
        {t("shell.skipToContent")}
      </a>
      <div className="horizon" aria-hidden="true" />
      <div className="shell">
        <header className="shell-topbar">
          <div className="shell-topbar__row">
            <Brand />
            <ThemeSwitcher initial={theme} />
          </div>
        </header>
        <aside className="shell-sidebar">
          <Brand />
          <SidebarNav />
          <div className="shell-sidebar__footer">
            <ThemeSwitcher initial={theme} />
          </div>
        </aside>
        <SosButton />
        <main id="main" className="shell-main" tabIndex={-1}>
          {children}
        </main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}

export function PageHeader({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      {lede ? <p className="page-lede">{lede}</p> : null}
    </header>
  );
}
