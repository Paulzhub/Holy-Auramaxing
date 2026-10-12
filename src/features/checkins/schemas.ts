import { z } from "zod";

import { NOTE_MAX, OUTCOMES, TRIGGERS } from "./constants";

/**
 * Server-side validation of the check-in forms (CLAUDE.md §10: Zod at every
 * server boundary). The database checks everything again.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** "" (not answered) becomes null. */
function optionalInt(min: number, max: number) {
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .pipe(z.number().int().min(min).max(max).nullable());
}

const note = z
  .string()
  .optional()
  .transform((v) => (v ?? "").replace(/\r\n/g, "\n").trim())
  .pipe(z.string().max(NOTE_MAX));

const triggers = z.array(z.enum(TRIGGERS)).max(TRIGGERS.length);

export const checkinSchema = z.object({
  date: isoDate,
  outcome: z.enum(OUTCOMES),
  mood: optionalInt(1, 5),
  urge: optionalInt(0, 5),
  triggers,
  note,
});
export type CheckinInput = z.infer<typeof checkinSchema>;

export const reflectionSchema = z.object({
  date: isoDate,
  triggers,
  note,
});
export type ReflectionInput = z.infer<typeof reflectionSchema>;

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function readCheckinForm(formData: FormData) {
  return checkinSchema.safeParse({
    date: field(formData, "date"),
    outcome: field(formData, "outcome"),
    mood: field(formData, "mood"),
    urge: field(formData, "urge"),
    triggers: formData.getAll("triggers").filter((v): v is string => typeof v === "string"),
    note: field(formData, "note"),
  });
}

export function readReflectionForm(formData: FormData) {
  return reflectionSchema.safeParse({
    date: field(formData, "date"),
    triggers: formData.getAll("triggers").filter((v): v is string => typeof v === "string"),
    note: field(formData, "note"),
  });
}

/**
 * A check-in made offline and sent later (§7.5, §13; D-067), as JSON from the
 * device. recordedAt is when the device says it was made, with its offset.
 * The database decides whether it still counts.
 */
export const offlineCheckinSchema = z.object({
  date: isoDate,
  recordedAt: z.iso.datetime({ offset: true }),
  outcome: z.enum(OUTCOMES),
  mood: z.number().int().min(1).max(5).nullable().default(null),
  urge: z.number().int().min(0).max(5).nullable().default(null),
  triggers: triggers.default([]),
  note: z
    .string()
    .max(NOTE_MAX * 2)
    .default("")
    .transform((v) => v.replace(/\r\n/g, "\n").trim())
    .pipe(z.string().max(NOTE_MAX)),
});
export type OfflineCheckinInput = z.infer<typeof offlineCheckinSchema>;
