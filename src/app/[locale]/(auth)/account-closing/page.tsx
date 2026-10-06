import { Sunrise } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  AccountDataNotice,
  AuthHeading,
  deletionDate,
  ExportDataForm,
  KeepAccountForm,
  requireSignedInAccount,
  SignOutButton,
} from "@/features/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("accountClosing") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The only page an account scheduled for deletion can open (D-033): keep the
 * account, take a copy, or sign out. Outside the app layout, which sends
 * such accounts here.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireSignedInAccount();
  if (!profile.deletion_requested_at) redirect("/home");
  const [t, format, params] = await Promise.all([getTranslations("accountData.closing"), getFormatter(), searchParams]);
  const date = format.dateTime(deletionDate(profile.deletion_requested_at), {
    dateStyle: "long",
    timeZone: profile.timezone,
  });

  return (
    <div className="auth-card">
      <Sunrise aria-hidden="true" className="auth-card__icon" />
      <AuthHeading title={t("title")} lede={t("body", { date })} />
      <AccountDataNotice notice={params.notice} />
      <blockquote className="auth-verse">
        <p>{t("verseText")}</p>
        <footer>{t("verseReference")}</footer>
      </blockquote>

      <h2 className="auth-subheading">{t("keepTitle")}</h2>
      <p>{t("keepBody")}</p>
      <KeepAccountForm />

      <h2 className="auth-subheading">{t("copyTitle")}</h2>
      <p>{t("copyBody")}</p>
      <ExportDataForm from="closing" />

      <h2 className="auth-subheading">{t("leaveTitle")}</h2>
      <p>{t("leaveBody", { date })}</p>
      <SignOutButton />
    </div>
  );
}
