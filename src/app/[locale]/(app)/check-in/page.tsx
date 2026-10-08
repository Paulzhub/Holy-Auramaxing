import { ChartLine } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import {
  AnsweredDay,
  CheckinErrorBanner,
  CheckinForm,
  getCheckinFor,
  getCheckinOverview,
  isCheckinErrorKey,
} from "@/features/checkins";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkIn") };
}

type SearchParams = Promise<{ date?: string; error?: string }>;

/**
 * The daily check-in (CLAUDE.md §7.5): today, plus yesterday until 12:00
 * local time. ?date= picks yesterday while it is still open.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId }, overview, query, t, tPage] = await Promise.all([
    requireAccount(),
    getCheckinOverview(),
    searchParams,
    getTranslations("checkins.form"),
    getTranslations("pages.checkIn"),
  ]);
  const date = query.date && overview.openDates.includes(query.date) ? query.date : overview.today;
  const isToday = date === overview.today;
  const existing = await getCheckinFor(userId, date);
  const other = overview.openDates.find((d) => d !== date);

  return (
    <>
      <PageHeader title={tPage("title")} lede={tPage("lede")} />
      <div className="stack checkin-page">
        <CheckinErrorBanner error={isCheckinErrorKey(query.error) ? query.error : null} />
        {existing ? (
          <AnsweredDay date={date} isToday={isToday} existing={existing} canChangeUntilNoon={!isToday} />
        ) : (
          <section className="ui-card">
            <CheckinForm date={date} isToday={isToday} existing={null} />
          </section>
        )}
        {other ? (
          <p className="checkin-other-day">
            {isToday ? `${t("yesterdayOpen")} ` : null}
            <Link href={isToday ? `/check-in?date=${other}` : "/check-in"} className="text-link">
              {isToday ? t("answerYesterday") : t("answerToday")}
            </Link>
          </p>
        ) : null}
        <p>
          <Link href="/progress" className="text-link">
            <ChartLine aria-hidden="true" className="inline-icon" /> {t("progressLink")}
          </Link>
        </p>
      </div>
    </>
  );
}
