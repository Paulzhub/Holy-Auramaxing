import { NextResponse, type NextRequest } from "next/server";

import { finishOAuthSignIn } from "@/features/auth";
import { siteOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Google sends people back here with a one-time code (PKCE). */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destination = await finishOAuthSignIn({
    code: url.searchParams.get("code"),
    providerError: url.searchParams.get("error"),
    next: url.searchParams.get("next"),
  });
  const response = NextResponse.redirect(new URL(destination, siteOrigin(url.origin)), { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
