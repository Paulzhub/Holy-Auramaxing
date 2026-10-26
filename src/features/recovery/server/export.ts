import type { ExportPart, ExportRow } from "@/lib/data-export";
import { decryptText } from "@/lib/security/encryption";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { contactContext, journalContext } from "./queries";

/**
 * "Download my data" (§7.1, §11): the journal (decrypted, for its author
 * only), the waves-ridden-out tally, the number shared with partners, and
 * the reading plan days read (D-112).
 */
export async function exportRecoveryData(userId: string): Promise<ExportPart> {
  const supabase = await createSupabaseServerClient();
  const [journal, tally, contact, reading, activePlan] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, prompt_key, body_encrypted, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase.from("recovery_tallies").select("waves, updated_at").eq("user_id", userId).maybeSingle(),
    supabase.from("partner_contacts").select("phone_encrypted, updated_at").eq("user_id", userId).maybeSingle(),
    supabase
      .from("devotional_progress")
      .select("plan, day, read_at")
      .eq("user_id", userId)
      .order("read_at", { ascending: true }),
    supabase.from("devotional_active_plan").select("plan, started_on").eq("user_id", userId).maybeSingle(),
  ]);
  if (journal.error) throw new Error(`journal export: ${journal.error.message}`);
  const open = (stored: string, context: string): string | null => {
    try {
      return decryptText(stored, context);
    } catch {
      return null;
    }
  };
  const journalRows: ExportRow[] = (journal.data ?? []).map((r) => ({
    id: r.id,
    prompt: r.prompt_key,
    text: open(r.body_encrypted, journalContext(userId, r.id)),
    written_at: r.created_at,
    edited_at: r.updated_at,
  }));
  return {
    sections: [
      {
        name: "journal",
        description: "Your private journal entries, decrypted for you. Nobody else can read them.",
        rows: journalRows,
      },
      {
        name: "waves_ridden_out",
        description: "How many times you rode out a hard moment with the SOS button. Only the number is kept.",
        rows: tally.data ? [{ waves: tally.data.waves, last_counted_at: tally.data.updated_at }] : [],
      },
      {
        name: "number_for_partners",
        description: "The phone number you shared with your active accountability partners, if any.",
        rows: contact.data
          ? [{ phone: open(contact.data.phone_encrypted, contactContext(userId)), updated_at: contact.data.updated_at }]
          : [],
      },
      {
        name: "reading_plan_days",
        description: "The reading plan days you marked as read.",
        rows: (reading.data ?? []).map((r) => ({ plan: r.plan, day: r.day, read_at: r.read_at })),
      },
      {
        name: "reading_plan_current",
        description: "The reading plan you are on now, if any.",
        rows: activePlan.data ? [{ plan: activePlan.data.plan, started_on: activePlan.data.started_on }] : [],
      },
    ],
    files: [],
  };
}
