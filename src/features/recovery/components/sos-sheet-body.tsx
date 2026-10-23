"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import { Link } from "@/i18n/navigation";

import { QuickActions, Tally, useSosContext, useWaves } from "./sos-actions";
import {
  AfterSlip,
  Breathing,
  LiveLine,
  SosPrayer,
  useAnnouncer,
  VerseCards,
  WaveTimer,
  type WaveTimerHandle,
} from "./sos-tools";

/** The SOS sheet's contents, loaded after the page has settled (D-106). */
export function SosSheetBody({ onClose }: { onClose: () => void }) {
  const t = useTranslations("sos");
  const [message, announce] = useAnnouncer();
  const context = useSosContext();
  const initial = context && context !== "loading" ? context.waves : 0;
  const { waves, note, count } = useWaves(initial, announce);
  const timer = useRef<WaveTimerHandle>(null);

  return (
    <div className="sos-body">
      <LiveLine message={message} />
      <Breathing announce={announce} />
      <VerseCards />
      <SosPrayer />
      <WaveTimer ref={timer} announce={announce} onFinish={() => void count()} />
      <Tally waves={waves} note={note} onCount={count} />
      <QuickActions
        context={context}
        announce={announce}
        onClose={onClose}
        onWalk={() => {
          timer.current?.start();
          document.getElementById("sos-wave")?.scrollIntoView({ block: "start" });
        }}
      />
      <AfterSlip
        link={
          <Link href="/check-in" className="text-link" onClick={onClose}>
            {t("afterSlipLink")}
          </Link>
        }
      />
    </div>
  );
}
