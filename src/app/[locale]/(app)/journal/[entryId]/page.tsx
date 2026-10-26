import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import { getJournalEntry, journalFlashDate, JournalEntryView, JournalNotice } from "@/features/recovery";
import { readFlash } from "@/lib/server/flash";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("journalEntry") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ entryId: string }> }) {
  const [{ userId, profile }, { entryId }, t] = await Promise.all([
    requireAccount(),
    params,
    getTranslations("journal"),
  ]);
  if (!UUID.test(entryId)) notFound();
  const entry = await getJournalEntry(userId, entryId);
  if (!entry) notFound();
  const flash = await readFlash(journalFlashDate());
  return (
    <>
      <PageHeader title={t("title")} />
      <JournalNotice flash={flash} />
      <JournalEntryView entry={entry} timeZone={profile.timezone} />
    </>
  );
}
