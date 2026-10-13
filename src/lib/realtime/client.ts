"use client";

import type { RealtimeClient } from "@supabase/realtime-js";

/**
 * One Realtime connection per tab, shared by the bell (D-089) and a group's
 * live updates (D-086). The client is loaded only when first asked for, so
 * it never counts against the first load, and NEXT_PUBLIC_REALTIME_ENABLED=false
 * turns it off (§14 kill switch). Channels carry content-free pings only.
 */

let shared: Promise<RealtimeClient | null> | null = null;

export function realtimeEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_REALTIME_ENABLED !== "false" &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

export function getRealtime(): Promise<RealtimeClient | null> {
  if (!realtimeEnabled()) return Promise.resolve(null);
  shared ??= import("@supabase/realtime-js").then(
    ({ RealtimeClient: Client }) =>
      new Client(`${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^http/, "ws")}/realtime/v1`, {
        params: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      }),
    () => null,
  );
  return shared;
}

/** Call after the page is idle, so the socket never competes with the first paint. */
export function whenIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(cb, { timeout: 4_000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 1_500);
  return () => clearTimeout(id);
}

/** Milliseconds until a channel name changes (it rolls at midnight UTC), plus a few seconds. */
export function msUntilTopicRollover(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5) - now.getTime();
}
