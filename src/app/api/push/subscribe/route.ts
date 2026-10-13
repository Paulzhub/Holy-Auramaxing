import { NextResponse } from "next/server";

import { getAccount } from "@/features/auth";
import { pushSubscriptionSchema, savePushSubscription } from "@/features/notifications";
import { consume } from "@/lib/security/rate-limit";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

/** Saves this browser's push subscription (D-092). Same-origin, signed-in, rate-limited. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const account = await getAccount();
  if (!account?.profile || account.blocked) return json({ error: "signedOut" }, 401);
  if (!(await consume("notificationSettingsByUser", account.userId)).ok) return json({ error: "rateLimited" }, 429);
  const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  return (await savePushSubscription(parsed.data)) ? json({ ok: true }, 200) : json({ error: "failed" }, 500);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
