"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAlertCounts, type AlertCounts } from "@/components/shell/alert-counts";
import { useToast } from "@/components/ui/toast";
import { usePathname } from "@/i18n/navigation";
import { getRealtime, msUntilTopicRollover, realtimeEnabled, whenIdle } from "@/lib/realtime/client";

/**
 * Live notifications (CLAUDE.md §7.8, D-089). Listens on my own daily HMAC
 * channel for content-free pings ("alerts changed"), then asks the server
 * for my unread counts (numbers only). A higher count shows a toast, which
 * the toast region announces politely (no timer, D-060), and updates the
 * bell, the group switcher and the app-icon badge (Badging API). On the
 * Alerts page itself the list refreshes quietly when the person isn't busy.
 * Counts are also re-read when the tab comes back into view, in case a ping
 * was missed. Messages arrive as props (no message bundle).
 */
export function LiveAlerts({ topic, labels }: { topic: string | null; labels: { newOne: string; newMany: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const { total, set } = useAlertCounts();
  const { show } = useToast();
  const last = useRef(total);
  const onAlerts = useRef(false);
  const { newOne, newMany } = labels;

  useEffect(() => {
    onAlerts.current = pathname === "/alerts";
  }, [pathname]);

  // The app-icon badge follows the count (installed PWAs; ignored elsewhere).
  useEffect(() => {
    last.current = total;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (total > 0) void nav.setAppBadge?.(total).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [total]);

  useEffect(() => {
    let stopped = false;
    let cleanup: (() => void) | undefined;
    let pending: ReturnType<typeof setTimeout> | undefined;

    const busy = () => {
      const el = document.activeElement;
      return (
        Boolean(el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) ||
        Boolean(document.querySelector("main details[open]"))
      );
    };

    const reload = async () => {
      try {
        const res = await fetch("/api/notifications/unread", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok || stopped) return;
        const counts = (await res.json()) as AlertCounts;
        if (typeof counts.total !== "number" || !counts.byGroup) return;
        const added = counts.total - last.current;
        if (added > 0) {
          show({ title: added === 1 ? newOne : newMany.replace("#", String(added)) });
          if (onAlerts.current && !busy()) router.refresh();
        }
        set(counts);
      } catch {
        // Offline or signed out: the next ping or visit tries again.
      }
    };
    const soon = () => {
      clearTimeout(pending);
      pending = setTimeout(() => void reload(), 800);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    document.addEventListener("visibilitychange", onVisible);

    const rollover = setTimeout(() => router.refresh(), msUntilTopicRollover());
    const start = async () => {
      if (!topic || !realtimeEnabled()) return;
      const client = await getRealtime();
      if (stopped || !client) return;
      const channel = client.channel(topic, { config: { broadcast: { self: false } } });
      channel
        .on("broadcast", { event: "changed" }, (message: { payload?: { what?: unknown } }) => {
          if (message.payload?.what === "alerts") soon();
        })
        .subscribe();
      cleanup = () => void client.removeChannel(channel);
    };
    const cancelIdle = whenIdle(() => void start());

    return () => {
      stopped = true;
      cancelIdle();
      clearTimeout(pending);
      clearTimeout(rollover);
      document.removeEventListener("visibilitychange", onVisible);
      cleanup?.();
    };
  }, [topic, newOne, newMany, router, set, show]);

  return null;
}
