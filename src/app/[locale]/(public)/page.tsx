import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthNotice } from "@/features/auth";
import { Landing, publicMetadata } from "@/features/marketing";
import { routing } from "@/i18n/routing";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "marketing.pages.home",
  });
  return publicMetadata({ title: t("title"), absoluteTitle: true, description: t("description"), path: "/" });
}

/** The landing page: the scroll story "From chains to freedom" (CLAUDE.md §8, D-118). */
export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const { notice } = await searchParams;
  setRequestLocale(hasLocale(routing.locales, locale) ? locale : routing.defaultLocale);
  return (
    <>
      {notice ? (
        <div className="public-content">
          <AuthNotice notice={notice} />
        </div>
      ) : null}
      <Landing />
    </>
  );
}
