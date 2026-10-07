import { z } from "zod";

import { BIO_MAX, HANDLE_PATTERN, TESTIMONY_MAX, VERSE_MAX, visibilities } from "./limits";
import { displayNameSchema } from "./onboarding";

/** Profile editor rules (CLAUDE.md §7.3). Error messages are keys under "profile.errors". */

export { BIO_MAX, DISPLAY_NAME_MAX, HANDLE_PATTERN, TESTIMONY_MAX, VERSE_MAX } from "./limits";
export { visibilities, type Visibility } from "./limits";

// Control and invisible formatting characters are refused (newlines are
// allowed in the longer texts). Everything is shown as plain text anyway.
const noControls = (allowNewlines: boolean) => (v: string) =>
  !(allowNewlines ? /[\p{Cf}\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/u : /[\p{Cc}\p{Cf}]/u).test(v);

/** "" becomes null, so clearing a field removes it. */
const optionalText = (max: number, tooLong: ProfileErrorKey, allowNewlines: boolean) =>
  z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(max, { error: tooLong }).refine(noControls(allowNewlines), { error: "textInvalid" }))
    .transform((v) => (v === "" ? null : v));

export const profileSchema = z.object({
  displayName: displayNameSchema.transform((v) => (v === "" ? null : v)),
  handle: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, "").toLowerCase())
    .pipe(z.string().regex(HANDLE_PATTERN, { error: "handleInvalid" })),
  bio: optionalText(BIO_MAX, "bioTooLong", true),
  testimony: optionalText(TESTIMONY_MAX, "testimonyTooLong", true),
  favouriteVerse: optionalText(VERSE_MAX, "verseTooLong", false),
  profileVisibility: z.enum(visibilities),
  bioVisibility: z.enum(visibilities),
  testimonyVisibility: z.enum(visibilities),
  verseVisibility: z.enum(visibilities),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileValues = z.output<typeof profileSchema>;
export type ProfileField = keyof ProfileInput;

export type ProfileErrorKey =
  | "nameTooLong"
  | "nameInvalid"
  | "handleInvalid"
  | "handleTaken"
  | "handleReserved"
  | "bioTooLong"
  | "testimonyTooLong"
  | "verseTooLong"
  | "textInvalid"
  | "choiceInvalid"
  | "rateLimited"
  | "saveFailed";

export interface ProfileFormState {
  status: "idle" | "error";
  fieldErrors?: Partial<Record<ProfileField, ProfileErrorKey>>;
  formError?: ProfileErrorKey;
}

const knownKeys = new Set<string>([
  "nameTooLong",
  "nameInvalid",
  "handleInvalid",
  "bioTooLong",
  "testimonyTooLong",
  "verseTooLong",
  "textInvalid",
]);

/** Reads the editor form. Unknown choices map to "choiceInvalid". */
export function parseProfileForm(
  formData: FormData,
): { ok: true; values: ProfileValues } | { ok: false; fieldErrors: Partial<Record<ProfileField, ProfileErrorKey>> } {
  const text = (name: string) => String(formData.get(name) ?? "");
  const parsed = profileSchema.safeParse({
    displayName: text("displayName"),
    handle: text("handle"),
    bio: text("bio"),
    testimony: text("testimony"),
    favouriteVerse: text("favouriteVerse"),
    profileVisibility: text("profileVisibility"),
    bioVisibility: text("bioVisibility"),
    testimonyVisibility: text("testimonyVisibility"),
    verseVisibility: text("verseVisibility"),
  });
  if (parsed.success) return { ok: true, values: parsed.data };
  const fieldErrors: Partial<Record<ProfileField, ProfileErrorKey>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as ProfileField;
    if (fieldErrors[field]) continue;
    fieldErrors[field] = (knownKeys.has(issue.message) ? issue.message : "choiceInvalid") as ProfileErrorKey;
  }
  return { ok: false, fieldErrors };
}

export type {
  ImageErrorKey as AvatarErrorKey,
  ImageFormState as AvatarFormState,
} from "@/components/image-picker/state";
