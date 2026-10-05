import { NextResponse, type NextRequest } from "next/server";

import { signOutIncompleteAccount } from "@/features/auth";
import { siteOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Used when someone is signed in but never finished signing up (no profile).
 * It signs out only in that case, so a link to it can't sign out a real
 * account. Normal sign-out is a POST Server Action (signOutAction).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destination = await signOutIncompleteAccount();
  const response = NextResponse.redirect(new URL(destination, siteOrigin(url.origin)), { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
