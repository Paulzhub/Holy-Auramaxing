import { NextResponse, type NextRequest } from "next/server";

import { getAccount } from "@/features/auth";
import { openNotification } from "@/features/notifications";
import { siteOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * A notification in Alerts links here: it's marked read and the person goes
 * where it leads (CLAUDE.md §7.8, D-089). The links are plain <a> elements,
 * never prefetched, so nothing is marked read just by being on screen.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = siteOrigin(new URL(request.url).origin);
  const account = await getAccount();
  const destination = account ? await openNotification((await params).id) : "/sign-in";
  const response = NextResponse.redirect(new URL(destination, origin), { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
