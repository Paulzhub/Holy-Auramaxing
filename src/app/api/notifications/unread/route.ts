import { NextResponse } from "next/server";

import { getAccount } from "@/features/auth";
import { getUnreadCounts } from "@/features/notifications";
import { consume } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The bell's unread counts, for the live client after a content-free ping
 * (D-089): numbers only, never names or text. Same-origin requests with the
 * session cookie; never cached.
 */
export async function GET() {
  const account = await getAccount();
  if (!account) return reply({ error: "not_signed_in" }, 401);
  if (!(await consume("notificationCountByUser", account.userId)).ok) return reply({ error: "rate_limited" }, 429);
  return reply(await getUnreadCounts(), 200);
}

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}
