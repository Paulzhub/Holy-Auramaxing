import { NextResponse } from "next/server";

import { currentNoteKey } from "@/lib/security/offline-note-keys";

export const dynamic = "force-dynamic";

/**
 * The public key a device uses to seal a private note while offline (D-123).
 * Public by nature (it can lock a note, never open one), but only the app
 * asks for it. `{ key: null }` means sealed notes are off: no key is set.
 */
export async function GET() {
  const key = await currentNoteKey().catch(() => null);
  return NextResponse.json({ key }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
