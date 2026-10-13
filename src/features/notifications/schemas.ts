import { z } from "zod";

import { DIGEST_MODES } from "./constants";

export const uuidSchema = z.uuid();

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** The "When they reach you" form (times are local, HH:MM). */
export const deliverySettingsSchema = z.object({
  reminderTime: z.union([z.literal(""), timeOfDay]),
  quietStart: timeOfDay,
  quietEnd: timeOfDay,
  digest: z.enum(DIGEST_MODES),
  discreet: z.boolean(),
  sound: z.boolean(),
  vibrate: z.boolean(),
});

/** ?before=<time>&id=<uuid> on the notification centre. */
export function parseCursor(before: unknown, id: unknown): { at: string; id: string } | null {
  const at = typeof before === "string" ? before : null;
  const key = typeof id === "string" ? id : null;
  if (!at || !key || !uuidSchema.safeParse(key).success || Number.isNaN(Date.parse(at)) || at.length > 40) {
    return null;
  }
  return { at, id: key };
}
