import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { Card, CardTitle } from "@/components/ui/card";
import { getThemePreference } from "@/lib/server/theme";
import { SignOutButton } from "@/features/auth";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button-variants";

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
            <CardTitle as="h2">{t("security")}</CardTitle>
            <p className="text-muted">{t("securityBody")}</p>
            <div>
              <Link href="/settings/security" className={buttonVariants({ variant: "secondary" })}>
                {t("securityLink")}
              </Link>
            </div>
          </div>
        </Card>
        <Card>
          <div className="grid gap-3">
            <CardTitle as="h2">{t("data")}</CardTitle>
            <p className="text-muted">{t("dataBody")}</p>
            <div>
              <Link href="/settings/data" className={buttonVariants({ variant: "secondary" })}>
                {t("dataLink")}
              </Link>
            </div>
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
