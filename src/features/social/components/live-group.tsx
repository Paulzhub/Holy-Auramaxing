"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button-variants";

/**
 * Live updates on a group's pages (CLAUDE.md §7.7, D-086). Listens on the
 * group's channel for today (an HMAC name only members are given) for
 * content-free pings, then asks the server for the page again, so RLS,
 * blocks and share levels decide what appears. Nothing personal comes over
 * the socket.
 *
 * - "today" (check-ins, reactions on them, people joining) refreshes quietly,
 *   unless the person is typing or has a menu open; then it waits.
 * - "wall" (posts, comments, reactions) on the wall page shows a button to
 *   load the new posts, announced politely, so nothing moves under a reader.
 *   On the group home it refreshes quietly like "today".
 *
 * The Realtime client is loaded after the page is idle, so it never counts
 * against the first-load budget, and NEXT_PUBLIC_REALTIME_ENABLED=false turns
 * it off (§14 kill switch). Messages arrive as props (no message bundle).
 */
export function LiveGroup({
  topic,
  mode,
  labels,
}: {
  topic: string;
  mode: "home" | "wall";
  labels: { newPosts: string; show: string };
}) {
  const router = useRouter();
  const [wallWaiting, setWallWaiting] = useState(false);
  const refreshWanted = useRef(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (process.env.NEXT_PUBLIC_REALTIME_ENABLED === "false" || !url || !key || !topic) return;

    let stopped = false;
    let cleanup: (() => void) | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    // Busy: typing in a field, or a <details> menu open (a nudge, a report).
    const busy = () => {
      const el = document.activeElement;
      return (
        Boolean(el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) ||
        Boolean(document.querySelector("main details[open]"))
      );
    };
    const tryRefresh = () => {
      if (!refreshWanted.current) return;
      if (document.visibilityState !== "visible" || busy()) {
        debounce = setTimeout(tryRefresh, 5_000);
        return;
      }
      refreshWanted.current = false;
      router.refresh();
    };
    const wantRefresh = () => {
      refreshWanted.current = true;
      clearTimeout(debounce);
      debounce = setTimeout(tryRefresh, 1_500);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tryRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // The channel name changes at midnight UTC: refresh then to get the new one.
    const now = new Date();
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5);
    const rollover = setTimeout(() => router.refresh(), midnight - now.getTime());

    const start = async () => {
      const { RealtimeClient } = await import("@supabase/realtime-js");
      if (stopped) return;
      const client = new RealtimeClient(`${url.replace(/^http/, "ws")}/realtime/v1`, { params: { apikey: key } });
      const channel = client.channel(topic, { config: { broadcast: { self: false } } });
      channel
        .on("broadcast", { event: "changed" }, (message: { payload?: { what?: unknown } }) => {
          const what = message.payload?.what;
          if (what === "wall" && mode === "wall") setWallWaiting(true);
          else if (what === "wall" || what === "today") wantRefresh();
        })
        .subscribe();
      cleanup = () => {
        void client.removeAllChannels();
        client.disconnect();
      };
    };
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(cb, { timeout: 4_000 })
        : setTimeout(cb, 1_500);
    idle(() => void start());

    return () => {
      stopped = true;
      clearTimeout(debounce);
      clearTimeout(rollover);
      document.removeEventListener("visibilitychange", onVisible);
      cleanup?.();
    };
  }, [topic, mode, router]);

  return (
    <div className="live-group" aria-live="polite">
      {wallWaiting ? (
        <p className="live-group__notice">
          <span>{labels.newPosts}</span>{" "}
          <button
            type="button"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
            onClick={() => {
              setWallWaiting(false);
              router.refresh();
            }}
          >
            {labels.show}
          </button>
        </p>
      ) : null}
    </div>
  );
}
