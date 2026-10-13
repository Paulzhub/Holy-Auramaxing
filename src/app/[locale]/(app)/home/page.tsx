import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { getCheckinOverview, KeptMessage, StreakStats, TodayCard } from "@/features/checkins";
import { getPushDevices, PushExplainer } from "@/features/notifications";
import { requireAccount } from "@/features/auth";
import { getMyLevel, getMyXpAndBadges, LevelCard, XpLine } from "@/features/gamification";
import { getMyNudges, NudgesForYou } from "@/features/social";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("home") };
}

/** Today: the check-in, nudges from friends, the streaks, and (after a streak ends) what was kept. */
export default async function Page() {
  const { userId, profile } = await requireAccount();
  const [t, overview, level, xp, nudges, devices] = await Promise.all([
    getTranslations("pages.home"),
    getCheckinOverview(),
    getMyLevel(),
    getMyXpAndBadges(userId),
    getMyNudges(null),
    getPushDevices(),
  ]);
  const slippedToday = overview.answered[overview.today] === "slipped";
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <div className="stack">
        <TodayCard overview={overview} />
        <NudgesForYou nudges={nudges} timeZone={profile.timezone} />
        {overview.totalCheckins > 0 ? <StreakStats overview={overview} /> : null}
        <LevelCard level={level}>
          <XpLine xp={xp.xp} />
        </LevelCard>
        {overview.currentStreak === 0 ? (
          <KeptMessage overview={overview} reason={slippedToday ? "slip" : "paused"} />
        ) : null}
        <figure className="verse">
          <blockquote>
            <p>{t("verseText")}</p>
          </blockquote>
          <figcaption>{t("verseReference")}</figcaption>
        </figure>
        {/* Only after a first check-in, before any browser prompt (§7.8, D-092). */}
        {overview.totalCheckins > 0 ? <PushExplainer hasDevice={devices.length > 0} /> : null}
      </div>
    </>
  );
}
