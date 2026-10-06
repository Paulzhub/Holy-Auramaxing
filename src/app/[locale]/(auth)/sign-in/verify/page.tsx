import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AuthHeading, SignOutButton, getTwoStepStatus, safeNextPath } from "@/features/auth";
import { RecoveryCodeForm, VerifyCodeForm } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("verify") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The second step of signing in, for people with an authenticator app (D-028). */
export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const status = await getTwoStepStatus();
  if (status === "signed-out") redirect("/sign-in");
  if (status === "ended") redirect("/api/auth/sign-out?reason=ended");
  if (status === "done") redirect(next);

  const t = await getTranslations("auth.verify");
  return (
    <div className="auth-card">
      <AuthHeading title={t("title")} lede={t("lede")} />
      <VerifyCodeForm next={next} />
      <details className="auth-details">
        <summary>{t("recoveryTitle")}</summary>
        <p className="text-muted">{t("recoveryBody")}</p>
        <RecoveryCodeForm next={next} />
      </details>
      <div className="auth-switch grid gap-2">
        <p className="text-muted">{t("notYou")}</p>
        <div>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
