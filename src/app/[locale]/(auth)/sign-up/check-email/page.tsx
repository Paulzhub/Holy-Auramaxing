import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AuthHeading } from "@/features/auth";
import { EmailLinkForm } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkEmail") };
}

export default async function CheckEmailPage() {
  const t = await getTranslations("auth.checkEmail");
  return (
    <div className="auth-card">
      <MailCheck aria-hidden="true" className="auth-card__icon" />
      <AuthHeading title={t("title")} lede={t("lede")} />
      <p>{t("body")}</p>
      <details className="auth-details">
        <summary>{t("resendTitle")}</summary>
        <p className="text-muted">{t("resendBody")}</p>
        <EmailLinkForm kind="verification" />
      </details>
      <p className="auth-switch">
        {t.rich("wrongEmail", { link: (chunks) => <Link href="/sign-up/account">{chunks}</Link> })}
      </p>
    </div>
  );
}
