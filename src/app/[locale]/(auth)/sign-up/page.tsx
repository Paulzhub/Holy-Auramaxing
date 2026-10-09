import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AuthHeading, AuthNotice } from "@/features/auth";
import { AgeForm } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  // Each step has its own title (WCAG 2.4.2).
  return { title: t("signUpStep", { current: 1, total: 3 }) };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Sign-up, step 1 of 3: the age question. */
export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("auth.signUp");
  const { notice } = await searchParams;
  return (
    <div className="auth-card">
      <p className="auth-step">{t("step", { current: 1, total: 3 })}</p>
      <AuthHeading title={t("age.title")} lede={t("age.lede")} />
      <AuthNotice notice={notice} />
      <AgeForm />
      <p className="auth-switch">
        {t.rich("haveAccount", { link: (chunks) => <Link href="/sign-in">{chunks}</Link> })}
      </p>
    </div>
  );
}
