import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { requireAccount } from "@/features/auth";
import { getCheckinFor, getCheckinOverview, StreakStats } from "@/features/checkins";
import { Link, redirect } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkIn") };
}

/** After a clean day: a quiet thank-you, the streak ring and a verse (§7.5). */
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [{ userId }, overview, { date }, t, tForm, format] = await Promise.all([
    requireAccount(),
    getCheckinOverview(),
    searchParams,
    getTranslations("checkins.done"),
    getTranslations("checkins.form"),
    getFormatter(),
  ]);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : overview.today;
  const checkin = await getCheckinFor(userId, day);
  if (!checkin || checkin.outcome !== "clean") redirect({ href: "/check-in", locale: await getLocale() });
  const when =
    day === overview.today
      ? tForm("today")
      : format.dateTime(new Date(`${day}T12:00:00Z`), { timeZone: "UTC", weekday: "long" });

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
