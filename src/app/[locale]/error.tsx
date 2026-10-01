"use client";

import { useTranslations } from "next-intl";

import { BrandMark } from "@/components/shell/brand-mark";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  return (
    <>
      <title>{t("meta.titleTemplate", { page: t("meta.error"), app: t("app.tabName") })}</title>
      <div className="horizon" aria-hidden="true" />
      <main id="main" className="status-page">
        <span className="brand">
          <BrandMark />
          {t("app.name")}
        </span>
        <h1 className="page-title">{t("errors.errorTitle")}</h1>
        <p className="page-lede">{t("errors.errorBody")}</p>
        <Button onClick={() => reset()}>{t("errors.tryAgain")}</Button>
      </main>
    </>
  );
}
