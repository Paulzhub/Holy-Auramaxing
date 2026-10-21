import { NextResponse, type NextRequest } from "next/server";

import { applyUnsubscribe, verifyUnsubscribe } from "@/features/notifications";
import { siteOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe (RFC 8058, D-092), named in each notification
 * email's List-Unsubscribe header. Mail apps POST here
 * ("List-Unsubscribe=One-Click"); the signed link is the authority, so no
 * session is needed. A GET (someone opening the link, or a scanner) only
 * shows the confirmation page, so nothing changes by just following it.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const link = verifyUnsubscribe(url.searchParams.get("k"));
  if (!link) return reply("invalid", 400);
  return (await applyUnsubscribe(link.userId, link.kind)) ? reply("ok", 200) : reply("invalid", 400);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Only the opaque link value goes on (D-098), nothing else from the address.
  const k = url.searchParams.get("k");
  const target = new URL(`/unsubscribe${k ? `?${new URLSearchParams({ k })}` : ""}`, siteOrigin(url.origin));
  const response = NextResponse.redirect(target, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function reply(body: string, status: number) {
  return new NextResponse(body, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
}
