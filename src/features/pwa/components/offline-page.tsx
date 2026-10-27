import { getLocale, getTranslations } from "next-intl/server";

import { MOODS, NOTE_MAX, TRIGGERS, URGE_LEVELS } from "@/features/checkins";

import { OfflineCheckin, type OfflineCheckinLabels } from "./offline-checkin";

/** The offline check-in's words, from the server (the page is kept by the service worker as it is). */
async function offlineLabels(): Promise<OfflineCheckinLabels> {
  const [t, tForm, tTrig, tMercy, tDone] = await Promise.all([
    getTranslations("pwa.offline"),
    getTranslations("checkins.form"),
    getTranslations("checkins.triggers"),
    getTranslations("checkins.mercies"),
    getTranslations("checkins.done"),
  ]);
  return {
    noSession: t("noSession"),
    dayLegend: t("dayLegend"),
    answerToday: tForm("answerToday"),
    answerYesterday: tForm("answerYesterday"),
    questionToday: tForm("questionToday"),
    questionYesterday: tForm("questionYesterday"),
    detailsSummary: tForm("detailsSummary"),
    detailsHint: tForm("detailsHint"),
    moodLegend: tForm("moodLegend"),
    moods: MOODS.map((m) => ({ value: String(m), label: tForm(`mood.${m}`) })),
    urgeLegend: tForm("urgeLegend"),
    urges: URGE_LEVELS.map((u) => ({ value: String(u), label: tForm(`urge.${u}`) })),
    skip: tForm("skip"),
    triggersLegend: tForm("triggersLegend"),
    triggers: TRIGGERS.map((k) => ({ value: k, label: tTrig(k) })),
    noteLabel: tForm("noteLabel"),
    noteHint: tForm("noteHint", { max: NOTE_MAX }),
    noteSealed: t("noteSealed"),
    noteOffline: t("noteOffline"),
    honest: tForm("honest"),
    choicesLabel: tForm("choicesLabel"),
    cleanToday: tForm("cleanToday"),
    cleanYesterday: tForm("cleanYesterday"),
    slipped: tForm("slipped"),
    saving: tForm("saving"),
    savedTitle: t("savedTitle"),
    savedBody: t.raw("savedBody") as string,
    waitingOne: t("waitingOne"),
    waitingMany: t.raw("waitingMany") as string,
    change: t("change"),
    saveFailed: t("saveFailed"),
    noDay: t("noDay"),
    mercyTitle: tMercy("title"),
    mercyLede: tMercy("lede"),
    mercyVerse: tMercy("verseText"),
    mercyReference: tMercy("verseReference"),
    freeTitle: tDone("title"),
    freeLede: tDone("lede"),
  };
}

/** The offline page's check-in (D-124). */
export async function OfflineCheckinPage() {
  const [labels, locale] = await Promise.all([offlineLabels(), getLocale()]);
  return <OfflineCheckin labels={labels} locale={locale} />;
}
