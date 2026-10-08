import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { getCheckinOverview, KeptMessage, StreakStats, TodayCard } from "@/features/checkins";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("home") };
}

/** Today: the check-in, the streaks, and (after a streak ends) what was kept. */
export default async function Page() {
  const [t, overview] = await Promise.all([getTranslations("pages.home"), getCheckinOverview()]);
  const slippedToday = overview.answered[overview.today] === "slipped";
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <div className="stack">
        <TodayCard overview={overview} />
        {overview.totalCheckins > 0 ? <StreakStats overview={overview} /> : null}
        {overview.currentStreak === 0 ? (
          <KeptMessage overview={overview} reason={slippedToday ? "slip" : "paused"} />
        ) : null}
        <figure className="verse">
          <blockquote>
            <p>{t("verseText")}</p>
          </blockquote>
          <figcaption>{t("verseReference")}</figcaption>
        </figure>
      </div>
    </>
  );
}
