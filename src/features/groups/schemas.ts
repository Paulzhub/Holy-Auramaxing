import { z } from "zod";

import { CHALLENGE_TYPES, GROUP_LIMITS, INVITE_LIMITS, JOIN_POLICIES, SHARE_LEVELS } from "./constants";
import type { GroupErrorKey, GroupField } from "./form-state";

/**
 * Group forms (CLAUDE.md §7.4). Server only (Zod stays out of the browser,
 * D-010). Error messages are keys under "groups.errors". The database
 * checks everything again.
 */

// Control and invisible formatting characters are refused (newlines are
// allowed in the longer texts). Everything is shown as plain text anyway.
const noControls = (allowNewlines: boolean) => (v: string) =>
  !(allowNewlines ? /[\p{Cf}\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/u : /[\p{Cc}\p{Cf}]/u).test(v);

const tidy = (v: string) => v.replace(/\r\n?/g, "\n").trim();

const name = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(GROUP_LIMITS.nameMin, { error: "nameLength" })
      .max(GROUP_LIMITS.nameMax, { error: "nameLength" })
      .refine(noControls(false), { error: "textInvalid" }),
  );

const description = z
  .string()
  .transform(tidy)
  .pipe(
    z
      .string()
      .max(GROUP_LIMITS.descriptionMax, { error: "descriptionTooLong" })
      .refine(noControls(true), { error: "textInvalid" }),
  )
  .transform((v) => (v === "" ? null : v));

const covenant = z
  .string()
  .transform(tidy)
  .pipe(
    z
      .string()
      .min(GROUP_LIMITS.covenantMin, { error: "covenantLength" })
      .max(GROUP_LIMITS.covenantMax, { error: "covenantLength" })
      .refine(noControls(true), { error: "textInvalid" }),
  );

const shareLevel = z.enum(SHARE_LEVELS, { error: "choiceInvalid" });
const checkbox = z.string().transform((v) => v === "on" || v === "yes" || v === "true");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "startDateInvalid" })
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), { error: "startDateInvalid" });
const timezone = z
  .string()
  .max(64, { error: "timezoneInvalid" })
  .refine(
    (v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return v.length > 0;
      } catch {
        return false;
      }
    },
    { error: "timezoneInvalid" },
  );

const challengeFields = {
  challengeType: z.enum(CHALLENGE_TYPES, { error: "choiceInvalid" }),
  customDays: z.string(),
  startDate: isoDate,
  timezone,
  maxMembers: z.coerce
    .number({ error: "maxMembersRange" })
    .int({ error: "maxMembersRange" })
    .min(GROUP_LIMITS.membersMin, { error: "maxMembersRange" })
    .max(GROUP_LIMITS.membersMax, { error: "maxMembersRange" }),
  joinPolicy: z.enum(JOIN_POLICIES, { error: "choiceInvalid" }),
};

/** customDays only matters (and must be a number of days) for a custom challenge. */
function withCustomDays<T extends { challengeType: string; customDays: string }>(
  schema: z.ZodType<T>,
): z.ZodType<Omit<T, "customDays"> & { customDays: number | null }> {
  return schema
    .superRefine((v, ctx) => {
      if (v.challengeType !== "custom") return;
      const n = Number(v.customDays);
      if (!Number.isInteger(n) || n < GROUP_LIMITS.customDaysMin || n > GROUP_LIMITS.customDaysMax) {
        ctx.addIssue({ code: "custom", path: ["customDays"], message: "customDaysRange" });
      }
    })
    .transform((v) => ({ ...v, customDays: v.challengeType === "custom" ? Number(v.customDays) : null }));
}

export const createGroupSchema = withCustomDays(
  z.object({
    name,
    description,
    ...challengeFields,
    covenant,
    minShareLevel: shareLevel,
    hidingAllowed: checkbox,
    myShareLevel: shareLevel,
  }),
);

export const groupDetailsSchema = z.object({ name, description });

export const groupChallengeSchema = withCustomDays(z.object(challengeFields));

export const covenantSchema = z.object({ covenant, minShareLevel: shareLevel, hidingAllowed: checkbox });

export const membershipSchema = z.object({ shareLevel, leaderboardHidden: checkbox });

export const inviteSchema = z.object({
  expiresInDays: z.coerce
    .number({ error: "choiceInvalid" })
    .refine((n) => (INVITE_LIMITS.expiryChoices as readonly number[]).includes(n), { error: "choiceInvalid" }),
  maxUses: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > INVITE_LIMITS.maxUsesMax) {
        ctx.addIssue({ code: "custom", message: "maxUsesRange" });
        return z.NEVER;
      }
      return n;
    }),
});

export const joinSchema = z.object({
  shareLevel,
  leaderboardHidden: checkbox,
  accept: checkbox.refine((v) => v, { error: "covenantNotAccepted" }),
  covenantSeen: z.iso.datetime({ offset: true, error: "covenantChanged" }),
});

export const uuidSchema = z.uuid();

const knownKeys = new Set<string>([
  "nameLength",
  "descriptionTooLong",
  "covenantLength",
  "customDaysRange",
  "startDateInvalid",
  "timezoneInvalid",
  "maxMembersRange",
  "maxUsesRange",
  "textInvalid",
  "covenantNotAccepted",
  "covenantChanged",
]);

export type ParseResult<T> =
  { ok: true; values: T } | { ok: false; fieldErrors: Partial<Record<GroupField, GroupErrorKey>> };

/** Reads form fields by name (missing fields read as ""), validates, and maps issues to error keys. */
export function parseForm<T>(schema: z.ZodType<T>, formData: FormData, fields: readonly GroupField[]): ParseResult<T> {
  const input: Record<string, string> = {};
  for (const field of fields) {
    const value = formData.get(field);
    input[field] = typeof value === "string" ? value : "";
  }
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fieldErrors: Partial<Record<GroupField, GroupErrorKey>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as GroupField;
    if (fieldErrors[field]) continue;
    fieldErrors[field] = (knownKeys.has(issue.message) ? issue.message : "choiceInvalid") as GroupErrorKey;
  }
  return { ok: false, fieldErrors };
}

export const createGroupFields = [
  "name",
  "description",
  "challengeType",
  "customDays",
  "startDate",
  "timezone",
  "maxMembers",
  "joinPolicy",
  "covenant",
  "minShareLevel",
  "hidingAllowed",
  "myShareLevel",
] as const satisfies readonly GroupField[];

export const challengeFieldNames = [
  "challengeType",
  "customDays",
  "startDate",
  "timezone",
  "maxMembers",
  "joinPolicy",
] as const satisfies readonly GroupField[];
