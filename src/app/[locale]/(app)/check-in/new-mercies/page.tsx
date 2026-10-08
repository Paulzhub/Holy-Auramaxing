import { Sunrise } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { requireAccount } from "@/features/auth";
import {
  CheckinErrorBanner,
  getCheckinFor,
  getCheckinOverview,
  isCheckinErrorKey,
  KeptMessage,
  NextStep,
  PrayerCard,
  ReflectionForm,
} from "@/features/checkins";
import { Link, redirect } from "@/i18n/navigation";

// A neutral tab title: never anything about a slip (§2.3).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkIn") };
}

type SearchParams = Promise<{ date?: string; saved?: string; error?: string }>;

/**
 * The slip flow (CLAUDE.md §7.5): grace first. A forgiveness verse, what the
 * person kept (owner's request, D-046), an optional private reflection, a way
 * to ask for prayer, and one next step. No red, no failure words.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId }, overview, query, t] = await Promise.all([
    requireAccount(),
    getCheckinOverview(),
    searchParams,
    getTranslations("checkins.mercies"),
  ]);
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : overview.today;
  const checkin = await getCheckinFor(userId, date);
  if (!checkin || checkin.outcome !== "slipped") redirect({ href: "/check-in", locale: await getLocale() });
  const canReflect = overview.openDates.includes(date);

  return (
    <div className="stack mercies">
      <header className="mercies__hero">
        <Sunrise aria-hidden="true" className="mercies__icon" />
        <h1 className="page-title">{t("title")}</h1>
        <p className="checkin-result__status" role="status">
          {t("status")}
        </p>
        <p className="page-lede">{t("lede")}</p>
        <figure className="verse mercies__verse">
          <blockquote>
            <p>{t("verseText")}</p>
          </blockquote>
          <figcaption>{t("verseReference")}</figcaption>
        </figure>
      </header>

      <KeptMessage overview={overview} reason="slip" />
      <CheckinErrorBanner error={isCheckinErrorKey(query.error) ? query.error : null} />
      {checkin && canReflect ? <ReflectionForm existing={checkin} saved={query.saved === "1"} /> : null}
      <PrayerCard />
      <NextStep date={date} />

      <div className="profile-actions">
        <Link href="/home" className={buttonVariants({ variant: "primary" })}>
          {t("homeLink")}
        </Link>
      </div>
    </div>
  );
}
