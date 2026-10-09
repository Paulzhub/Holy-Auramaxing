import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { AuthHeading, hasAdultAnswer } from "@/features/auth";
import { ConsentForm } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  // Each step has its own title (WCAG 2.4.2).
  return { title: t("signUpStep", { current: 2, total: 3 }) };
}

/** Sign-up, step 2 of 3: what we collect and the two consents. */
export default async function ConsentPage() {
  if (!(await hasAdultAnswer())) redirect({ href: "/sign-up", locale: await getLocale() });
  const t = await getTranslations("auth.signUp");
  return (
    <div className="auth-card auth-card--wide">
      <p className="auth-step">{t("step", { current: 2, total: 3 })}</p>
      <AuthHeading title={t("consent.title")} lede={t("consent.lede")} />
      <ConsentForm />
    </div>
  );
}
