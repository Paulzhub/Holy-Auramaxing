import { NextResponse } from "next/server";

import { APP_VERSION } from "@/lib/pwa/version";

export const dynamic = "force-dynamic";

/**
 * Which version the server runs now (D-125). An open page compares it with
 * its own and offers "Refresh" when they differ. Nothing personal.
 */
export function GET() {
  return NextResponse.json({ version: APP_VERSION }, { headers: { "Cache-Control": "no-store" } });
}
