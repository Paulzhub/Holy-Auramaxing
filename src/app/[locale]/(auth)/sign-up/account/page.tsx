import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { AuthHeading, AuthNotice, readSignupTicket } from "@/features/auth";
import { EmailSignUpForm, GoogleButton } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  // Each step has its own title (WCAG 2.4.2).
  return { title: t("signUpStep", { current: 3, total: 3 }) };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Sign-up, step 3 of 3: Google or email and password. */
export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await readSignupTicket())) redirect({ href: "/sign-up?notice=expired", locale: await getLocale() });
  const t = await getTranslations("auth.signUp");
  const { notice } = await searchParams;
  return (
    <div className="auth-card">
      <p className="auth-step">{t("step", { current: 3, total: 3 })}</p>
      <AuthHeading title={t("account.title")} lede={t("account.lede")} />
      <AuthNotice notice={notice} />
      <GoogleButton intent="signup" />
      <p className="auth-divider">
        <span>{t("account.or")}</span>
      </p>
      <EmailSignUpForm />
    </div>
  );
}
