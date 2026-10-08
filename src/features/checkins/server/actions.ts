"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { encryptText } from "@/lib/security/encryption";
import { consume } from "@/lib/security/rate-limit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { checkinErrorKey, type CheckinErrorKey } from "../errors";
import { readCheckinForm, readReflectionForm } from "../schemas";
import { noteContext } from "./queries";

/**
 * Check-in writes (CLAUDE.md §7.5). Each validates the form, rate-limits,
 * encrypts the note with the person's id and the day bound in (D-025), and
 * calls a database function as the person; the database checks the window
 * and everything else again (D-042). Plain form posts: they work without
 * JavaScript and answer with a redirect.
 */

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

function back(date: string | undefined, error: CheckinErrorKey): Promise<never> {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `date=${date}&` : "";
  return go(`/check-in?${day}error=${error}`);
}

/** The generated types can't express a SQL null argument; PostgREST sends JSON null. */
function sqlNull<T>(value: T | null): T {
  return value as T;
}

/** Streaks show on Home, Progress, the group pages and the switcher. */
function refresh() {
  revalidatePath("/[locale]", "layout");
}

export async function submitCheckinAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount();
  const rawDate = formData.get("date");
  const date = typeof rawDate === "string" ? rawDate : undefined;
  if (!(await consume("checkinSaveByUser", userId)).ok) return back(date, "rateLimited");

  const parsed = readCheckinForm(formData);
  if (!parsed.success) return back(date, "invalid");
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_checkin", {
    p_local_date: input.date,
    p_outcome: input.outcome,
    p_mood: sqlNull(input.mood),
    p_urge_level: sqlNull(input.urge),
    p_triggers: input.triggers,
    p_note_encrypted: sqlNull(input.note ? encryptText(input.note, noteContext(userId, input.date)) : null),
  });
  if (error) {
    devLog("checkin", error);
    return back(input.date, checkinErrorKey(error));
  }
  refresh();
  // A slip goes to the grace page (§7.5); a clean day to a quiet thank-you.
  return go(
    input.outcome === "slipped" ? `/check-in/new-mercies?date=${input.date}` : `/check-in/done?date=${input.date}`,
  );
}

/** The optional "what led to it?" reflection after a slip. */
export async function saveReflectionAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount();
  const parsed = readReflectionForm(formData);
  const rawDate = formData.get("date");
  const date = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "";
  const page = `/check-in/new-mercies?date=${date}`;
  if (!(await consume("checkinSaveByUser", userId)).ok) return go(`${page}&error=rateLimited`);
  if (!parsed.success) return go(`${page}&error=invalid`);
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_checkin_reflection", {
    p_local_date: input.date,
    p_triggers: input.triggers,
    p_note_encrypted: sqlNull(input.note ? encryptText(input.note, noteContext(userId, input.date)) : null),
  });
  if (error) {
    devLog("checkin-reflection", error);
    return go(`${page}&error=${checkinErrorKey(error)}`);
  }
  refresh();
  return go(`${page}&saved=1#reflection`);
}
