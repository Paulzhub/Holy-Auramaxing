import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runAccountPurge } from "@/features/auth";
import { readServerEnv } from "@/lib/env";
import { devLog } from "@/lib/server/dev-log";

export const dynamic = "force-dynamic";

/**
 * Erases accounts whose 14 days are over and removes their files from
 * Storage (D-033). Vercel Cron calls it daily (vercel.json) with
 * "Authorization: Bearer $CRON_SECRET"; locally, `npm run accounts:purge`.
 * Without a CRON_SECRET of at least 32 characters it doesn't exist (404).
 */
export async function GET(request: NextRequest) {
  const secret = readServerEnv().CRON_SECRET;
  if (!secret || secret.length < 32) return reply({ error: "not_found" }, 404);
  if (!authorised(request.headers.get("authorization"), secret)) return reply({ error: "unauthorised" }, 401);

  try {
    return reply(await runAccountPurge(), 200);
  } catch (error) {
    devLog("account", error);
    return reply({ error: "failed" }, 500);
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
