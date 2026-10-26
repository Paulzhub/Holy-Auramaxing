import { cache } from "react";

import { getMyGroups } from "@/features/groups";
import { getMyActivePartners } from "@/features/social";
import { decryptText } from "@/lib/security/encryption";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { RECOVERY_LIMITS } from "../constants";
import { dialable } from "../schemas";

/** Journal entries are bound to their author and id, so a value can't be moved to another row or person. */
export const journalContext = (userId: string, entryId: string) => `journal:${userId}:${entryId}`;
/** The journal's one-minute notes are keyed by the UTC day (src/lib/server/flash.ts). */
export const journalFlashDate = () => new Date().toISOString().slice(0, 10);
export const contactContext = (userId: string) => `partner-contact:${userId}`;

export interface SosPartner {
  groupId: string;
  partnerId: string;
  name: string;
  iAllowAlerts: boolean;
  /** Only if they chose to share one with their partners. */
  phone: { shown: string; tel: string; whatsapp: string } | null;
}

export interface SosContext {
  partners: SosPartner[];
  groups: { id: string; name: string }[];
  waves: number;
}

/** What the SOS sheet's quick actions need, read as the person (RLS). */
export async function getSosContext(userId: string): Promise<SosContext> {
  const supabase = await createSupabaseServerClient();
  const [partners, groups, contacts, tally] = await Promise.all([
    getMyActivePartners(userId),
    getMyGroups(userId),
    supabase.rpc("partner_contacts_for_me"),
    supabase.from("recovery_tallies").select("waves").eq("user_id", userId).maybeSingle(),
  ]);
  const phones = new Map<string, string>();
  for (const row of contacts.data ?? []) {
    try {
      phones.set(row.partner_id, decryptText(row.phone_encrypted, contactContext(row.partner_id)));
    } catch {
      // A value that doesn't decrypt is simply not offered.
    }
  }
  return {
    partners: partners.map((p) => {
      const phone = phones.get(p.partnerId);
      return { ...p, phone: phone ? { shown: phone, ...dialable(phone) } : null };
    }),
    groups: groups.filter((g) => g.status === "active" && !g.archivedAt).map((g) => ({ id: g.id, name: g.name })),
    waves: tally.data?.waves ?? 0,
  };
}

export async function getMyWaves(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("recovery_tallies").select("waves").eq("user_id", userId).maybeSingle();
  return data?.waves ?? 0;
}

/** My own number for partners, decrypted for the settings form. */
export async function getMyPartnerContact(userId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("partner_contacts")
    .select("phone_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  try {
    return decryptText(data.phone_encrypted, contactContext(userId));
  } catch {
    return null;
  }
}

export interface JournalEntry {
  id: string;
  promptKey: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalPage {
  entries: JournalEntry[];
  /** The cursor for the next (older) page, if there is one. */
  next: { before: string; id: string } | null;
}

function decryptEntry(
  userId: string,
  r: { id: string; prompt_key: string | null; body_encrypted: string; created_at: string; updated_at: string },
): JournalEntry {
  let body: string;
  try {
    body = decryptText(r.body_encrypted, journalContext(userId, r.id));
  } catch {
    body = "";
  }
  return { id: r.id, promptKey: r.prompt_key, body, createdAt: r.created_at, updatedAt: r.updated_at };
}

/** Newest first, a page at a time (cursor pagination, never OFFSET; §14). */
export async function getJournal(userId: string, cursor?: { before: string; id: string } | null): Promise<JournalPage> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("journal_entries")
    .select("id, prompt_key, body_encrypted, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(RECOVERY_LIMITS.journalPageSize + 1);
  if (cursor) {
    query = query.or(`created_at.lt."${cursor.before}",and(created_at.eq."${cursor.before}",id.lt.${cursor.id})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`journal: ${error.message}`);
  const rows = data ?? [];
  const page = rows.slice(0, RECOVERY_LIMITS.journalPageSize);
  const last = page.at(-1);
  return {
    entries: page.map((r) => decryptEntry(userId, r)),
    next: rows.length > page.length && last ? { before: last.created_at, id: last.id } : null,
  };
}

export const getJournalEntry = cache(async (userId: string, id: string): Promise<JournalEntry | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("id, prompt_key, body_encrypted, created_at, updated_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  return data ? decryptEntry(userId, data) : null;
});
