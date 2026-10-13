"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { getRealtime, msUntilTopicRollover, realtimeEnabled, whenIdle } from "@/lib/realtime/client";

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
 * The Realtime client is loaded after the page is idle and shared with the
 * bell (one socket per tab, @/lib/realtime/client), so it never counts against
 * the first-load budget; NEXT_PUBLIC_REALTIME_ENABLED=false turns it off (§14
 * kill switch). Messages arrive as props (no message bundle).
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
    if (!realtimeEnabled() || !topic) return;

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
    const rollover = setTimeout(() => router.refresh(), msUntilTopicRollover());

    const start = async () => {
      const client = await getRealtime();
      if (stopped || !client) return;
      const channel = client.channel(topic, { config: { broadcast: { self: false } } });
      channel
        .on("broadcast", { event: "changed" }, (message: { payload?: { what?: unknown } }) => {
          const what = message.payload?.what;
          if (what === "wall" && mode === "wall") setWallWaiting(true);
          else if (what === "wall" || what === "today") wantRefresh();
        })
        .subscribe();
      cleanup = () => void client.removeChannel(channel);
    };
    const cancelIdle = whenIdle(() => void start());

    return () => {
      stopped = true;
      cancelIdle();
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
