import { encryptText } from "@/lib/security/encryption";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { checkinErrorKey, type CheckinErrorKey } from "../errors";
import type { OfflineCheckinInput } from "../schemas";
import { noteContext } from "./queries";

/**
 * Sends one check-in made offline (CLAUDE.md §7.5, §13; D-067). The note is
 * encrypted here, with the person and the day bound in, like an online
 * check-in. The database checks the window by the device's record, the
 * 7-day limit and the account's age (private.save_offline_checkin).
 *
 * `drop` tells the device's queue (Phase 10) to forget the item: it will
 * never be accepted. Anything else (signed out, rate limited, a server
 * error) is worth trying again later.
 */
export type OfflineSyncResult =
  { ok: true; status: "created" | "updated" | "synced_late" } | { ok: false; error: CheckinErrorKey; drop: boolean };

const permanent: readonly CheckinErrorKey[] = ["syncTooOld", "alreadyAnswered", "windowClosed", "invalid"];

function sqlNull<T>(value: T | null): T {
  return value as T;
}

export async function syncOfflineCheckin(userId: string, input: OfflineCheckinInput): Promise<OfflineSyncResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_offline_checkin", {
    p_local_date: input.date,
    p_recorded_at: input.recordedAt,
    p_outcome: input.outcome,
    p_mood: sqlNull(input.mood),
    p_urge_level: sqlNull(input.urge),
    p_triggers: input.triggers,
    p_note_encrypted: sqlNull(input.note ? encryptText(input.note, noteContext(userId, input.date)) : null),
  });
  if (error) {
    devLog("checkin-offline", error);
    const key = checkinErrorKey(error);
    return { ok: false, error: key, drop: permanent.includes(key) };
  }
  return { ok: true, status: data as "created" | "updated" | "synced_late" };
}
