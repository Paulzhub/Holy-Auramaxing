import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { DeleteAccountForm, ExportDataForm, requireAccount } from "@/features/auth";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("deleteAccount") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Deleting the account: what happens, a copy first, then one confirmation (D-033). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await requireAccount();
  const [t, params] = await Promise.all([getTranslations("accountData.deletePage"), searchParams]);
  const steps = ["step1", "step2", "step3", "step4"] as const;

  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <div className="stack">
        {/* Some people leave the morning after a slip (grace review 1, G-15). */}
        <p className="delete-hard-stretch">{t("hardStretch")}</p>
        <section className="profile-section" aria-labelledby="what-happens-title">
          <h2 id="what-happens-title" className="profile-section__title">
            {t("whatHappens")}
          </h2>
          <ol className="auth-list">
            {steps.map((step) => (
              <li key={step}>{t(step)}</li>
            ))}
          </ol>
        </section>

        <section className="profile-section" aria-labelledby="copy-first-title">
          <h2 id="copy-first-title" className="profile-section__title">
            {t("copyFirst")}
          </h2>
          <p>{t("copyFirstBody")}</p>
          <ExportDataForm />
        </section>

        <section className="profile-section" aria-labelledby="confirm-title">
          <h2 id="confirm-title" className="profile-section__title">
            {t("confirmTitle")}
          </h2>
          <DeleteAccountForm error={params.error} />
          <p>
            <Link href="/settings/data">{t("goBack")}</Link>
          </p>
        </section>
      </div>
    </>
  );
}
