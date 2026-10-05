import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { Card, CardTitle } from "@/components/ui/card";
import { getThemePreference } from "@/lib/server/theme";
import { SignOutButton } from "@/features/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("settings") };
}

export default async function Page() {
  const t = await getTranslations("pages.settings");
  const theme = await getThemePreference();

  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <div className="stack">
        <Card>
          <div className="grid gap-3">
            <CardTitle as="h2">{t("appearance")}</CardTitle>
            <p className="text-muted">{t("appearanceBody")}</p>
            <ThemeSwitcher initial={theme} showLabels />
          </div>
        </Card>
        <Card>
          <div className="grid gap-3">
            <CardTitle as="h2">{t("language")}</CardTitle>
            <p className="text-muted">{t("languageBody")}</p>
          </div>
        </Card>
        <Card>
          <div className="grid gap-3">
            <CardTitle as="h2">{t("account")}</CardTitle>
            <p className="text-muted">{t("accountBody")}</p>
            <div>
              <SignOutButton />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
