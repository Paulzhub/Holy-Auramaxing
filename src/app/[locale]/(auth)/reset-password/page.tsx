import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { AuthHeading, getAccount } from "@/features/auth";
import { ResetPasswordForm } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("resetPassword") };
}

/** Reached from a password-reset email, which signed the person in. */
export default async function ResetPasswordPage() {
  const account = await getAccount();
  if (!account) redirect({ href: "/forgot-password?notice=link-invalid", locale: await getLocale() });
  const t = await getTranslations("auth.resetPassword");
  return (
    <div className="auth-card">
      <AuthHeading title={t("title")} lede={t("lede")} />
      <ResetPasswordForm email={account?.email ?? null} />
    </div>
  );
}
