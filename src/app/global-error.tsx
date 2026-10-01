"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";

import messages from "../../messages/en.json";
import "./globals.css";

// Last-resort boundary when the root layout itself fails, so the app's intl
// provider isn't available: provide the English messages directly.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <GlobalErrorContent reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function GlobalErrorContent({ reset }: { reset: () => void }) {
  const t = useTranslations();
  return (
    <>
      <title>{t("meta.titleTemplate", { page: t("meta.error"), app: t("app.tabName") })}</title>
      <main className="status-page">
        <h1 className="page-title">{t("errors.errorTitle")}</h1>
        <p className="page-lede">{t("errors.errorBody")}</p>
        <button type="button" className="ui-button ui-button--primary" onClick={() => reset()}>
          {t("errors.tryAgain")}
        </button>
      </main>
    </>
  );
}
