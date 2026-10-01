import { NextResponse } from "next/server";

import { readPublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness check for uptime monitoring. Reports whether Supabase is
 * configured and reachable, without exposing any configuration values.
 */
export async function GET() {
  const env = readPublicEnv();
  let supabase: "not_configured" | "ok" | "unreachable" = "not_configured";

  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    try {
      const res = await fetch(new URL("/auth/v1/health", env.NEXT_PUBLIC_SUPABASE_URL), {
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      supabase = res.ok ? "ok" : "unreachable";
    } catch {
      supabase = "unreachable";
    }
  }

  return NextResponse.json({ status: "ok", supabase }, { headers: { "Cache-Control": "no-store" } });
}
