import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AuthHeading, AuthNotice } from "@/features/auth";
import { EmailLinkForm } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("forgotPassword") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("auth.forgotPassword");
  const { notice } = await searchParams;
  return (
    <div className="auth-card">
      <AuthHeading title={t("title")} lede={t("lede")} />
      <AuthNotice notice={notice} />
      <EmailLinkForm kind="passwordReset" />
      <p className="auth-switch">
        <Link href="/sign-in">{t("back")}</Link>
      </p>
    </div>
  );
}
