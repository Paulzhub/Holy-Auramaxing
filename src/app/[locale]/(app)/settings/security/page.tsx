import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import {
  getSecurityOverview,
  PasskeyList,
  requireAccount,
  SecurityNotice,
  SessionList,
  TwoStepOff,
} from "@/features/auth";
import { PasskeyAddButton, RecoveryCodesButton, TwoStepSetup } from "@/features/auth/ui-security";
import { clientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("security") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Settings → Security: two-step sign-in, passkeys, devices and sessions (Phase 2d). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireAccount();
  const [overview, t, messages, params] = await Promise.all([
    getSecurityOverview(),
    getTranslations("security"),
    clientMessages(["security", "auth"]),
    searchParams,
  ]);
  const timeZone = profile.timezone;

  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <p>
        <Link href="/settings">{t("back")}</Link>
      </p>
      <SecurityNotice notice={params.notice} />
      <NextIntlClientProvider messages={messages}>
        <div className="stack security-page">
          <section className="profile-section" aria-labelledby="two-step-title">
            <h2 id="two-step-title" className="profile-section__title">
              {t("twoStep.title")}{" "}
              <span className="ui-tag">{overview.twoStep.on ? t("twoStep.on") : t("twoStep.off")}</span>
            </h2>
            <TwoStepSetup on={overview.twoStep.on}>
              {overview.twoStep.on ? (
                <>
                  <p>{t("twoStep.onBody")}</p>
                  <p className="text-muted">{t("twoStep.codesLeft", { count: overview.twoStep.recoveryCodesLeft })}</p>
                  <RecoveryCodesButton />
                  <TwoStepOff />
                </>
              ) : (
                <p>{t("twoStep.offBody")}</p>
              )}
            </TwoStepSetup>
          </section>

          {overview.passkeys ? (
            <section className="profile-section" aria-labelledby="passkeys-title">
              <h2 id="passkeys-title" className="profile-section__title">
                {t("passkeys.title")}
              </h2>
              <p>{t("passkeys.body")}</p>
              <PasskeyList passkeys={overview.passkeys} timeZone={timeZone} />
              <PasskeyAddButton />
            </section>
          ) : null}

          <section className="profile-section" aria-labelledby="sessions-title">
            <h2 id="sessions-title" className="profile-section__title">
              {t("sessions.title")}
            </h2>
            <p>{t("sessions.body")}</p>
            <SessionList sessions={overview.sessions} timeZone={timeZone} />
          </section>
        </div>
      </NextIntlClientProvider>
    </>
  );
}
