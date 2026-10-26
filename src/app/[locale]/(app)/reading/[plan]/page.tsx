import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import {
  getPlanDay,
  getPlanOutline,
  getPlanProgress,
  journalFlashDate,
  parsePlanDay,
  planBySlug,
  PlanDaysView,
  ReadingNotice,
} from "@/features/recovery";
import { readFlash } from "@/lib/server/flash";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("readingPlan") };
}

type Params = Promise<{ plan: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** One reading plan: every day, and the chosen day's chapters (?day=N, a day number only). */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ userId }, { plan: slug }, query, t] = await Promise.all([
    requireAccount(),
    params,
    searchParams,
    getTranslations("reading"),
  ]);
  const meta = planBySlug(slug);
  if (!meta) notFound();
  const [progress, outline, flash] = await Promise.all([
    getPlanProgress(userId, meta.slug),
    getPlanOutline(meta.slug),
    readFlash(journalFlashDate()),
  ]);
  const day = parsePlanDay(query.day, meta.length) ?? progress.next ?? 1;
  const passages = await getPlanDay(meta.slug, day);
  return (
    <>
      <PageHeader title={t(`plans.${meta.titleKey}.title`)} lede={t(`plans.${meta.titleKey}.body`)} />
      <ReadingNotice flash={flash} />
      <PlanDaysView plan={progress} outline={outline} day={day} passages={passages} />
    </>
  );
}
