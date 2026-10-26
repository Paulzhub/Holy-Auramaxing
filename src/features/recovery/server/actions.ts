"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requireAccount } from "@/features/auth";
import { askGroupForPrayer, sendPartnerSos } from "@/features/social";
import { redirect } from "@/i18n/navigation";
import { consume } from "@/lib/security/rate-limit";
import { encryptText } from "@/lib/security/encryption";
import { setFlash } from "@/lib/server/flash";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { journalBodySchema, journalPromptSchema, phoneSchema, uuidSchema } from "../schemas";
import { contactContext, getSosContext, journalContext, journalFlashDate, type SosContext } from "./queries";
import { uuidV7 } from "./uuid";

/**
 * Recovery tools (CLAUDE.md §7.9). The SOS sheet's actions return their
 * result to the sheet itself, so nothing about them ever reaches an address.
 * The journal's forms come back to the very same address, with the result in
 * the one-minute cookie (D-098).
 */

export type SosResult =
  | { ok: true; kind: "wave"; waves: number }
  | { ok: true; kind: "partners" | "group" }
  | { ok: false; error: "rateLimited" | "failed" | "noAlerts" | "invalidInput" | "signedOut" };

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

/** The sheet asks for this when it opens (partners, groups and the tally). */
export async function sosContextAction(): Promise<SosContext | null> {
  const account = await requireAccount().catch(() => null);
  if (!account) return null;
  return getSosContext(account.userId);
}

/** "I made it through" / the timer reaching the end: one more wave. Only ever counts up. */
export async function countWaveAction(): Promise<SosResult> {
  const { userId } = await requireAccount();
  if (!(await consume("sosByUser", userId)).ok) return { ok: false, error: "rateLimited" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("count_wave");
  if (error || typeof data !== "number") return { ok: false, error: "failed" };
  return { ok: true, kind: "wave", waves: data };
}

/** Let my partners know (only partners I allowed alerts for get anything). */
export async function alertPartnersAction(): Promise<SosResult> {
  const { userId } = await requireAccount();
  if (!(await consume("sosByUser", userId)).ok) return { ok: false, error: "rateLimited" };
  const context = await getSosContext(userId);
  if (!context.partners.some((p) => p.iAllowAlerts)) return { ok: false, error: "noAlerts" };
  const error = await sendPartnerSos();
  if (error === "rateLimited") return { ok: false, error: "rateLimited" };
  return error ? { ok: false, error: "failed" } : { ok: true, kind: "partners" };
}

/** Ask one of my groups to pray (a prayer request on its wall). */
export async function askGroupAction(groupId: string, body: string): Promise<SosResult> {
  const { userId } = await requireAccount();
  if (!uuidSchema.safeParse(groupId).success) return { ok: false, error: "invalidInput" };
  if (!(await consume("wallPostByUser", userId)).ok) return { ok: false, error: "rateLimited" };
  const error = await askGroupForPrayer(groupId, body);
  if (error === "invalidInput") return { ok: false, error: "invalidInput" };
  if (error === "rateLimited") return { ok: false, error: "rateLimited" };
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/[locale]", "layout");
  return { ok: true, kind: "group" };
}

// ---------------------------------------------------------------- the journal

const today = journalFlashDate;

/** New entry (no id) or an edit of my own. Back to the same address either way. */
export async function saveJournalAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount();
  const rawId = String(formData.get("id") ?? "");
  const isNew = rawId === "";
  const back = isNew ? "/journal" : `/journal/${rawId}`;
  if (!isNew && !uuidSchema.safeParse(rawId).success) return go("/journal");
  const body = journalBodySchema.safeParse(String(formData.get("body") ?? ""));
  if (!body.success) {
    await setFlash(today(), "error", "journalInvalid");
    return go(back);
  }
  if (!(await consume("journalByUser", userId)).ok) {
    await setFlash(today(), "error", "rateLimited");
    return go(back);
  }
  const id = isNew ? uuidV7() : rawId;
  const prompt = journalPromptSchema.parse(String(formData.get("prompt") ?? "") || undefined);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_journal_entry", {
    p_id: id,
    p_prompt_key: prompt as string,
    p_body_encrypted: encryptText(body.data, journalContext(userId, id)),
    p_new: isNew,
  });
  await setFlash(today(), error ? "error" : "saved", error ? "journalFailed" : "journal");
  return go(back);
}

export async function deleteJournalAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount();
  const id = String(formData.get("id") ?? "");
  if (!uuidSchema.safeParse(id).success) return go("/journal");
  if (!(await consume("journalByUser", userId)).ok) {
    await setFlash(today(), "error", "rateLimited");
    return go(`/journal/${id}`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_journal_entry", { p_id: id });
  await setFlash(today(), error ? "error" : "saved", error ? "journalFailed" : "journalDeleted");
  return go(error ? `/journal/${id}` : "/journal");
}

// ---------------------------------------------------------------- the number partners can call

export async function partnerContactAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount();
  const remove = formData.get("remove") === "1";
  const raw = String(formData.get("phone") ?? "");
  const parsed = remove || raw.trim() === "" ? null : phoneSchema.safeParse(raw);
  if (parsed && !parsed.success) return go("/settings?error=phoneInvalid");
  if (!(await consume("partnerContactByUser", userId)).ok) return go("/settings?error=phoneRateLimited");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_partner_contact", {
    p_phone_encrypted: (parsed ? encryptText(parsed.data, contactContext(userId)) : null) as string,
  });
  const notice = parsed ? "phoneSaved" : "phoneRemoved";
  return go(error ? "/settings?error=phoneFailed" : `/settings?notice=${notice}`);
}
