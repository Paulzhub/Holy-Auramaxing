"use client";

import { LifeBuoy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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

/**
 * Always visible, one tap away on every signed-in screen (CLAUDE.md §7.9,
 * D-106). Everything except reaching out works without a connection, because
 * it is all in this bundle; the offline page (/breathe) has the same tools.
 */
export function SosButton({ placement = "shell" }: { placement?: "shell" | "corner" }) {
  const t = useTranslations("sos");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={placement === "corner" ? "sos-button sos-button--corner" : "sos-button"}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <LifeBuoy aria-hidden="true" />
        {t("button")}
      </button>
      <Dialog
        variant="sheet"
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("description")}
        closeLabel={t("close")}
        className="sos-sheet"
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            {t("done")}
          </Button>
        }
      >
        {open ? <SosSheetBody onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}

function SosSheetBody({ onClose }: { onClose: () => void }) {
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
