import { useTranslations } from "next-intl";

import { BrandMark } from "@/components/shell/brand-mark";
import { buttonVariants } from "@/components/ui/button-variants";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations();
  return (
    <>
      <title>{t("meta.titleTemplate", { page: t("meta.notFound"), app: t("app.tabName") })}</title>
      <meta name="robots" content="noindex" />
      <div className="horizon" aria-hidden="true" />
      <main id="main" className="status-page">
        <span className="brand">
          <BrandMark />
          {t("app.tabName")}
        </span>
        <h1 className="page-title">{t("errors.notFoundTitle")}</h1>
        <p className="page-lede">{t("errors.notFoundBody")}</p>
        <Link href="/home" className={buttonVariants()}>
          {t("errors.goHome")}
        </Link>
      </main>
    </>
  );
}
