import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import {
  getJournal,
  journalFlashDate,
  JournalList,
  JournalNotice,
  JournalWriteCard,
  parseJournalCursor,
} from "@/features/recovery";
import { readFlash } from "@/lib/server/flash";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("journal") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The private journal (CLAUDE.md §7.9, D-108): encrypted, readable only by its author. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId, profile }, query, t] = await Promise.all([
    requireAccount(),
    searchParams,
    getTranslations("journal"),
  ]);
  const cursor = parseJournalCursor(query.before, query.id);
  const [page, flash] = await Promise.all([getJournal(userId, cursor), readFlash(journalFlashDate())]);
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: profile.timezone }).format(new Date());
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <JournalNotice flash={flash} />
      <div className="stack">
        {cursor ? null : <JournalWriteCard localDate={localDate} timeZone={profile.timezone} />}
        <JournalList page={page} timeZone={profile.timezone} isFirst={!cursor} />
      </div>
    </>
  );
}
