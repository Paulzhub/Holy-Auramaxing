"use client";

import { LifeBuoy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Body = ComponentType<{ onClose: () => void }>;
/** Set once the code has loaded, so opening the sheet later needs no network at all. */
let loadedBody: Body | null = null;
const loadBody = () =>
  import("./sos-sheet-body").then((m) => {
    loadedBody = m.SosSheetBody;
    return m;
  });
const LazyBody = lazy(() => loadBody().then((m) => ({ default: m.SosSheetBody })));

/** If the code can't load (offline before it was ever fetched), point to the offline page. */
class BodyFallback extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Warm the sheet's code once the page is idle, so it's ready (offline too) before anyone needs it. */
function useWarmSheet(): boolean {
  const [ready, setReady] = useState(() => loadedBody !== null);
  useEffect(() => {
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      loadBody()
        .then(() => {
          if (!cancelled) setReady(true);
        })
        .catch(() => undefined);
    };
    // Safari has no requestIdleCallback; a timer alone is fine there.
    const idle = () => ("requestIdleCallback" in window ? window.requestIdleCallback(warm, { timeout: 3000 }) : warm());
    const timer = window.setTimeout(idle, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return ready;
}

/**
 * Always visible, one tap away on every signed-in screen (CLAUDE.md §7.9,
 * D-106). The button is tiny; the sheet's code loads a few seconds after the
 * page settles (or at once if SOS is tapped first), so pages stay fast. Once
 * loaded, everything except reaching out works without a connection; the
 * offline page (/breathe) has the same tools.
 */
export function SosButton({ placement = "shell" }: { placement?: "shell" | "corner" }) {
  const t = useTranslations("sos");
  const [open, setOpen] = useState(false);
  const ready = useWarmSheet();

  return (
    <>
      <button
        type="button"
        className={placement === "corner" ? "sos-button sos-button--corner" : "sos-button"}
        aria-haspopup="dialog"
        // "ready" once the sheet's code is here, so it opens even offline.
        data-ready={ready ? "true" : undefined}
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
        {open ? <SheetBody onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}

function SheetBody({ onClose }: { onClose: () => void }) {
  const t = useTranslations("sos");
  const Loaded = loadedBody;
  if (Loaded) return <Loaded onClose={onClose} />;
  return (
    <BodyFallback
      fallback={
        <p>
          {/* A full page load on purpose: offline, the service worker answers it with its copy of /breathe. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="text-link" href="/breathe">
            {t("openOffline")}
          </a>
        </p>
      }
    >
      <Suspense fallback={<p className="text-muted">{t("opening")}</p>}>
        <LazyBody onClose={onClose} />
      </Suspense>
    </BodyFallback>
  );
}
