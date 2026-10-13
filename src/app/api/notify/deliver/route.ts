import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runDelivery } from "@/features/notifications";
import { readServerEnv } from "@/lib/env";
import { devLog } from "@/lib/server/dev-log";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The notification sender (CLAUDE.md §7.8, D-092). The database calls it
 * (pg_net, "Authorization: Bearer $CRON_SECRET") when push or email is
 * ready; it sends batches for up to about 20 seconds and answers counts
 * only. Without a CRON_SECRET of at least 32 characters it doesn't exist (404).
 */
export async function POST(request: NextRequest) {
  const secret = readServerEnv().CRON_SECRET;
  if (!secret || secret.length < 32) return reply({ error: "not_found" }, 404);
  if (!authorised(request.headers.get("authorization"), secret)) return reply({ error: "unauthorised" }, 401);

  const started = Date.now();
  const totals = { claimed: 0, sent: 0, retry: 0, failed: 0 };
  try {
    for (;;) {
      const run = await runDelivery(100);
      totals.claimed += run.claimed;
      totals.sent += run.sent;
      totals.retry += run.retry;
      totals.failed += run.failed;
      if (run.claimed < 100 || Date.now() - started > 20_000) break;
    }
    return reply(totals, 200);
  } catch (error) {
    devLog("notifications", error);
    return reply({ error: "failed", ...totals }, 500);
  }
}

function authorised(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
