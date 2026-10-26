import { z } from "zod";

import { JOURNAL_PROMPTS, RECOVERY_LIMITS } from "./constants";

export const uuidSchema = z.uuid();

export const journalBodySchema = z
  .string()
  .transform((s) => s.replace(/\r\n/g, "\n").trim())
  .pipe(z.string().min(1).max(RECOVERY_LIMITS.journalMax));

export const journalPromptSchema = z
  .string()
  .optional()
  .transform((v) => (v && JOURNAL_PROMPTS.includes(v) ? v : null));

/**
 * A phone or WhatsApp number: digits with an optional leading +, spaces,
 * dashes, dots or brackets; 6 to 15 digits. Stored as typed, dialled as
 * digits only.
 */
export const phoneSchema = z
  .string()
  .trim()
  .max(RECOVERY_LIMITS.phoneMaxChars)
  .regex(/^\+?[0-9 ()./-]+$/)
  .refine((v) => {
    const digits = v.replace(/\D/g, "").length;
    return digits >= 6 && digits <= 15;
  });

/** Digits (with a leading + kept) for tel: links; digits only for wa.me. */
export function dialable(phone: string): { tel: string; whatsapp: string } {
  const digits = phone.replace(/\D/g, "");
  return { tel: phone.trim().startsWith("+") ? `+${digits}` : digits, whatsapp: digits };
}

/** ?before=&id= on the journal list; anything odd starts at the newest. */
export function parseJournalCursor(before: unknown, id: unknown): { before: string; id: string } | null {
  if (typeof before !== "string" || typeof id !== "string") return null;
  if (before.length > 40 || Number.isNaN(Date.parse(before)) || !uuidSchema.safeParse(id).success) return null;
  return { before, id };
}
