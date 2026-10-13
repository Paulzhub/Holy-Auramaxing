import { z } from "zod";

import { POST_KINDS, REACTION_KINDS, REPORT_REASONS, SOCIAL_LIMITS, WALL_FILTERS, type WallFilter } from "./constants";

/**
 * The wall's forms (CLAUDE.md §7.7). Server only (Zod stays out of the
 * browser, D-010). The database checks everything again, and runs the
 * automatic filter (D-080).
 */

export const uuidSchema = z.uuid();

/** Line breaks kept (no more than one blank line in a row), other control characters dropped. */
export function tidyText(v: string): string {
  return v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const text = (max: number) =>
  z
    .string()
    .transform(tidyText)
    .pipe(z.string().min(1, { error: "bodyEmpty" }).max(max, { error: "bodyTooLong" }));

export const postSchema = z.object({
  kind: z.enum(POST_KINDS, { error: "invalidInput" }),
  body: text(SOCIAL_LIMITS.postMax),
});

export const postBodySchema = text(SOCIAL_LIMITS.postMax);
export const commentBodySchema = text(SOCIAL_LIMITS.commentMax);

export const reactionSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  target: uuidSchema,
  kind: z.enum(REACTION_KINDS),
  on: z.enum(["1", "0"]).transform((v) => v === "1"),
});

export const reportSchema = z.object({
  targetType: z.enum(["post", "comment", "member"]),
  target: uuidSchema,
  reason: z.enum(REPORT_REASONS, { error: "reasonMissing" }),
  note: z
    .string()
    .transform(tidyText)
    .pipe(z.string().max(SOCIAL_LIMITS.reportNoteMax, { error: "noteTooLong" })),
});

/** ?kind= and ?before= on the wall; anything unknown falls back to the first page of everything. */
export function parseWallQuery(query: Record<string, string | string[] | undefined>): {
  filter: WallFilter;
  before: string | null;
} {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const kind = one(query.kind);
  const before = one(query.before);
  return {
    filter: (WALL_FILTERS as readonly string[]).includes(kind ?? "") ? (kind as WallFilter) : "all",
    before: before && uuidSchema.safeParse(before).success ? before : null,
  };
}
