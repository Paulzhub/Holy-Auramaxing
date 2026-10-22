"use client";

import { useTranslations } from "next-intl";

import { AfterSlip, Breathing, LiveLine, SosPrayer, useAnnouncer, VerseCards, WaveTimer } from "./sos-tools";

/**
 * The offline page's tools (/breathe, D-106): the same breathing guide,
 * Scripture cards, prayer and timer as the SOS sheet, with no account and
 * no connection needed. The service worker keeps a copy of this page.
 */
export function SosOffline() {
  const t = useTranslations("sos");
  const [message, announce] = useAnnouncer();
  return (
    <div className="sos-body">
      <LiveLine message={message} />
      <Breathing announce={announce} />
      <VerseCards />
      <SosPrayer />
      <WaveTimer announce={announce} />
      <p className="sos-gentle">{t("wave.stopped")}</p>
      <AfterSlip />
    </div>
  );
}
