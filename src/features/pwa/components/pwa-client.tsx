"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { NoteKey } from "@/lib/offline/sealed-note";
import { SW_MESSAGES, SYNC_TAG } from "@/lib/pwa/constants";
import { listQueue, saveSession, takeNotices } from "@/lib/pwa/store";
import { APP_VERSION, isVersion, serviceWorkerUrl } from "@/lib/pwa/version";

// Loaded with the shell, so `beforeinstallprompt` is caught however early it comes.
import "../install-store";

export interface PwaClientLabels {
  /** "Your check-in for {day} was saved." */
  synced: string;
  noteLost: string;
  updateTitle: string;
  updateBody: string;
  refresh: string;
  later: string;
}


const CHECK_EVERY_MS = 60 * 60 * 1000;
const RECHECK_AFTER_MS = 5 * 60 * 1000;

function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** The version the server runs now, or null when it can't be reached. */
async function serverVersion(): Promise<string | null> {
  try {
    const response = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" });
    const body = (await response.json()) as { version?: unknown };
    return isVersion(body.version) ? body.version : null;
  } catch {
    return null;
  }
}

/**
 * Registers the worker for the version the server runs now (D-125), so a tab
 * left open on old code never asks for an old worker. When this page is that
 * version, a waiting worker may take over at once; otherwise it waits for
 * "Refresh".
 */
async function registerWorker(version: string): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  try {
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl(version), { scope: "/" });
    const waiting = registration.waiting ?? registration.installing;
    if (version === APP_VERSION && waiting && new URL(waiting.scriptURL).searchParams.get("v") === APP_VERSION) {
      waiting.postMessage(SW_MESSAGES.skipWaiting);
    }
    return registration;
  } catch {
    return null;
  }
}

/** Asks the worker to send the queue now, and Background Sync to try again later where the browser has it. */
async function flushQueue(registration: ServiceWorkerRegistration | null): Promise<void> {
  if (!registration) return;
  const queued = await listQueue();
  if (!queued.length) return;
  const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } })
    .sync;
  await sync?.register(SYNC_TAG).catch(() => undefined);
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000)),
  ]);
  (ready?.active ?? registration.active)?.postMessage(SW_MESSAGES.flush);
}

/**
 * The installable app's quiet helper (CLAUDE.md §13; D-124 to D-127), in the
 * signed-in shell on every page:
 *
 *  - registers the service worker for this version, after the page settles;
 *  - tells this device who is signed in, their time zone and the app lock's
 *    owner (for the offline page), and keeps the server's public note key;
 *  - asks the worker to send any check-ins made offline: on open, when the
 *    connection returns and when the app comes back to the front, and says
 *    when one was saved;
 *  - notices a newer deploy and offers "Refresh" (never reloads by itself).
 */
export function PwaClient({
  userId,
  timeZone,
  lockOwner,
  locale,
  labels,
}: {
  userId: string;
  timeZone: string;
  lockOwner: string;
  locale: string;
  labels: PwaClientLabels;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheck = useRef(0);

  const checkVersion = useCallback(async (force = false) => {
    if (!force && Date.now() - lastCheck.current < RECHECK_AFTER_MS) return;
    lastCheck.current = Date.now();
    const version = await serverVersion();
    if (!version) return;
    if (version !== APP_VERSION) setLatest(version);
    // The worker for what the server runs now (a no-op when it's already there).
    const found = await registerWorker(version);
    if (found) registration.current = found;
  }, []);

  useEffect(() => {
    let stopped = false;
    const start = async () => {
      await checkVersion(true);
      if (stopped) return;
      let noteKey: NoteKey | null = null;
      try {
        const response = await fetch("/api/checkins/offline-key", { credentials: "same-origin" });
        noteKey = ((await response.json()) as { key: NoteKey | null }).key;
      } catch {
        noteKey = null;
      }
      await saveSession({ userId, timeZone, lockOwner, at: Date.now() }, noteKey);
      registration.current?.active?.postMessage(SW_MESSAGES.refreshOffline);
      await flushQueue(registration.current);
    };
    // After the page has settled, so none of this competes with the page itself (D-106).
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(() => void start(), { timeout: 5000 });
      else void start();
    }, 4000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [userId, timeZone, lockOwner, checkVersion]);

  // Back online, back to the front, and every hour.
  useEffect(() => {
    const again = () => {
      void checkVersion(registration.current === null).then(() => flushQueue(registration.current));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") again();
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void checkVersion(true), CHECK_EVERY_MS);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [checkVersion]);

  // What the worker sent (it keeps a note when no page of the app was open to hear it).
  const showNotices = useCallback(async () => {
    const notices = await takeNotices();
    for (const notice of notices) {
      show({
        title: labels.synced.replace("{day}", dayLabel(notice.localDate, locale)),
        description: notice.noteLost ? labels.noteLost : undefined,
        tone: "success",
      });
    }
    if (notices.length) router.refresh();
  }, [labels, locale, router, show]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null;
      if (data?.type === SW_MESSAGES.synced) void showNotices();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    void showNotices();
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [showNotices]);

  const refresh = () => {
    const waiting = registration.current?.waiting;
    if (waiting) {
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
      waiting.postMessage(SW_MESSAGES.skipWaiting);
      // If the worker can't take over (another tab holds it), load the new pages anyway.
      window.setTimeout(() => window.location.reload(), 3000);
    } else {
      window.location.reload();
    }
  };

  if (!latest || dismissedFor === latest) return null;
  return (
    <section className="update-banner" aria-labelledby="update-banner-title" data-testid="update-banner">
      <RefreshCw aria-hidden="true" className="update-banner__icon" />
      <div className="update-banner__text" aria-live="polite">
        <h2 id="update-banner-title" className="update-banner__title">
          {labels.updateTitle}
        </h2>
        <p>{labels.updateBody}</p>
      </div>
      <div className="update-banner__actions">
        <Button size="sm" onClick={refresh}>
          {labels.refresh}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissedFor(latest)}>
          {labels.later}
        </Button>
      </div>
    </section>
  );
}
