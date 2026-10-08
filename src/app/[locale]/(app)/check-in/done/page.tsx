import { CircleCheck, Sunrise } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

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
  StreakStats,
} from "@/features/checkins";
import { Link, redirect } from "@/i18n/navigation";

// A neutral tab title for both answers: never anything about a slip (§2.3).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkIn") };
}

type SearchParams = Promise<{ date?: string; saved?: string; error?: string }>;
type Overview = Awaited<ReturnType<typeof getCheckinOverview>>;
type Checkin = NonNullable<Awaited<ReturnType<typeof getCheckinFor>>>;

/**
 * After a check-in (CLAUDE.md §7.5). One address for both answers, so the
 * browser history, the address bar and the host's request logs never show
 * which answer someone gave (privacy review 1, D-055). What the page shows
 * comes from the saved check-in, never from the URL.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId }, overview, query] = await Promise.all([requireAccount(), getCheckinOverview(), searchParams]);
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : overview.today;
  const checkin = await getCheckinFor(userId, date);
  if (!checkin) {
    redirect({ href: "/check-in", locale: await getLocale() });
    return null;
  }

  return checkin.outcome === "slipped" ? (
    <NewMercies overview={overview} checkin={checkin} date={date} query={query} />
  ) : (
    <Done overview={overview} date={date} />
  );
}

/** After a clean day: a quiet thank-you, the streak ring and a verse. */
async function Done({ overview, date }: { overview: Overview; date: string }) {
  const [t, tForm, format] = await Promise.all([
    getTranslations("checkins.done"),
    getTranslations("checkins.form"),
    getFormatter(),
  ]);
  const when =
    date === overview.today
      ? tForm("today")
      : format.dateTime(new Date(`${date}T12:00:00Z`), { timeZone: "UTC", weekday: "long" });

  return (
    <div className="stack checkin-result">
      <header className="checkin-result__header">
        <CircleCheck aria-hidden="true" className="checkin-result__icon checkin-icon--clean" />
        <h1 className="page-title">{t("title")}</h1>
        <p className="checkin-result__status" role="status">
          {t("status", { day: when })}
        </p>
        <p className="page-lede">{t("lede")}</p>
      </header>
      <StreakStats overview={overview} />
      <figure className="verse">
        <blockquote>
          <p>{t("verseText")}</p>
        </blockquote>
        <figcaption>{t("verseReference")}</figcaption>
      </figure>
      <div className="profile-actions">
        <Link href="/home" className={buttonVariants({ variant: "primary" })}>
          {t("homeLink")}
        </Link>
        <Link href="/progress" className={buttonVariants({ variant: "secondary" })}>
          {tForm("progressLink")}
        </Link>
      </div>
    </div>
  );
}

/**
 * The slip flow: grace first. A forgiveness verse, what the person kept
 * (owner's request, D-046), an optional private reflection, a way to ask for
 * prayer, and one next step. No red, no failure words.
 */
async function NewMercies({
  overview,
  checkin,
  date,
  query,
}: {
  overview: Overview;
  checkin: Checkin;
  date: string;
  query: { saved?: string; error?: string };
}) {
  const t = await getTranslations("checkins.mercies");
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
      {canReflect ? <ReflectionForm existing={checkin} saved={query.saved === "1"} /> : null}
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
