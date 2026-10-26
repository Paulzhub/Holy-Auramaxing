import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import {
  CurrentPlanCard,
  getPlanDay,
  getReadingOverview,
  journalFlashDate,
  localDateIn,
  PlanChoices,
  ReadingNotice,
  VerseOfDayCard,
} from "@/features/recovery";
import { readFlash } from "@/lib/server/flash";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("reading") };
}

/** Daily reading (CLAUDE.md §7.9, D-112): the verse of the day and the reading plans. */
export default async function Page() {
  const [{ userId, profile }, t] = await Promise.all([requireAccount(), getTranslations("reading")]);
  const localDate = localDateIn(profile.timezone);
  const [overview, flash] = await Promise.all([getReadingOverview(userId, localDate), readFlash(journalFlashDate())]);
  const active = overview.active;
  const passages = active?.next ? await getPlanDay(active.slug, active.next) : [];
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <ReadingNotice flash={flash} />
      <div className="stack">
        <VerseOfDayCard verse={overview.verse} />
        {active ? <CurrentPlanCard plan={active} passages={passages} /> : null}
        <PlanChoices plans={overview.plans} activeSlug={active?.slug ?? null} />
      </div>
    </>
  );
}
