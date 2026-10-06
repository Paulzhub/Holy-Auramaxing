import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { AccountDataNotice, ExportDataForm, requireAccount } from "@/features/auth";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("yourData") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Settings → Your data: download everything, or delete the account (D-032, D-033). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await requireAccount();
  const [t, params] = await Promise.all([getTranslations("accountData"), searchParams]);

  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <p>
        <Link href="/settings">{t("back")}</Link>
      </p>
      <AccountDataNotice notice={params.notice} />
      <div className="stack">
        <section className="profile-section" aria-labelledby="export-title">
          <h2 id="export-title" className="profile-section__title">
            {t("export.title")}
          </h2>
          <p>{t("export.body")}</p>
          <p className="text-muted">{t("export.warning")}</p>
          <ExportDataForm />
        </section>

        <section className="profile-section" aria-labelledby="delete-title">
          <h2 id="delete-title" className="profile-section__title">
            {t("delete.title")}
          </h2>
          <p>{t("delete.body")}</p>
          <div>
            <Link href="/settings/data/delete" className={buttonVariants({ variant: "secondary" })}>
              {t("delete.link")}
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
