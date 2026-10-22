import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { Card, CardTitle } from "@/components/ui/card";
import { getThemePreference } from "@/lib/server/theme";
import { requireAccount, SignOutButton } from "@/features/auth";
import { NotificationSettingsCard } from "@/features/notifications";
import { getMyPartnerContact, PartnerContactCard, RecoveryNotice } from "@/features/recovery";
import { getSocialSettings, SocialNotice, SocialSettingsCard } from "@/features/social";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button-variants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("settings") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId }, query] = await Promise.all([requireAccount(), searchParams]);
  const [socialSettings, partnerPhone] = await Promise.all([getSocialSettings(userId), getMyPartnerContact(userId)]);
  const t = await getTranslations("pages.settings");
  const tb = await getTranslations("social.block");
  const tn = await getTranslations("social.nudges");
  const tNotify = await getTranslations("notifications.settings");
  const theme = await getThemePreference();

  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <SocialNotice notice={query.notice} error={query.error} />
      <RecoveryNotice notice={query.notice} error={query.error} />
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
            <CardTitle as="h2">{tNotify("title")}</CardTitle>
            <NotificationSettingsCard />
          </div>
        </Card>
        <Card>
          <div className="grid gap-3">
            <CardTitle as="h2">{tn("settingsTitle")}</CardTitle>
            <p className="text-muted">{tn("settingsBody")}</p>
            <SocialSettingsCard settings={socialSettings} />
          </div>
        </Card>
        <Card>
          <PartnerContactCard phone={partnerPhone} />
        </Card>
        <Card>
          <div className="grid gap-3">
            <CardTitle as="h2">{tb("settingsTitle")}</CardTitle>
            <p className="text-muted">{tb("settingsBody")}</p>
            <div>
              <Link href="/settings/blocked" className={buttonVariants({ variant: "secondary" })}>
                {tb("settingsLink")}
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
