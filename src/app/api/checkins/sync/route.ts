import { NextResponse } from "next/server";

import { getAccount } from "@/features/auth";
import { offlineCheckinSchema, syncOfflineCheckin } from "@/features/checkins";
import { consume } from "@/lib/security/rate-limit";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

/**
 * Late offline check-ins (CLAUDE.md §7.5, §13; D-067). The device's queue
 * (Phase 10) posts one check-in as JSON:
 *   { date, recordedAt, outcome, mood?, urge?, triggers?, note? }
 * and gets back { status } or { error, drop }. `drop: true` means it will
 * never be accepted, so the queue should forget it. 401 and 429 are worth
 * retrying later. Same-origin only (CSRF), signed-in only.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden", drop: false }, 403);

  const account = await getAccount();
  if (!account?.profile || account.blocked) return json({ error: "signedOut", drop: false }, 401);

  if (!(await consume("checkinSaveByUser", account.userId)).ok) {
    return json({ error: "rateLimited", drop: false }, 429);
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = offlineCheckinSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid", drop: true }, 400);

  const result = await syncOfflineCheckin(account.userId, parsed.data);
  if (result.ok) return json({ status: result.status }, 200);
  const status =
    result.error === "rateLimited" ? 429 : result.error === "accountClosing" ? 403 : result.drop ? 409 : 500;
  return json({ error: result.error, drop: result.drop }, status);
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
