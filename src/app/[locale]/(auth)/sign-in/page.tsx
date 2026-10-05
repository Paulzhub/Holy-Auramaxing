import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AuthHeading, AuthNotice } from "@/features/auth";
import { EmailLinkForm, GoogleButton, SignInForm } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("signIn") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("auth.signIn");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <div className="auth-card">
      <AuthHeading title={t("title")} lede={t("lede")} />
      <AuthNotice notice={params.notice} />
      <SignInForm next={next} />
      <p className="auth-divider">
        <span>{t("or")}</span>
      </p>
      <GoogleButton intent="signin" next={next} />
      <details className="auth-details">
        <summary>{t("magicLinkTitle")}</summary>
        <p className="text-muted">{t("magicLinkBody")}</p>
        <EmailLinkForm kind="magicLink" next={next} />
      </details>
      <p className="auth-switch">{t.rich("noAccount", { link: (chunks) => <Link href="/sign-up">{chunks}</Link> })}</p>
    </div>
  );
}
