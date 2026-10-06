import { z } from "zod";

import type { AuthErrorKey } from "./form-state";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./policy";

// Error messages are message keys under "auth.errors" (messages/en.json).

export const emailSchema = z
  .string({ error: "emailRequired" })
  .trim()
  .min(1, { error: "emailRequired" })
  .max(254, { error: "emailInvalid" })
  .pipe(z.email({ error: "emailInvalid" }))
  .transform((v) => v.toLowerCase());

/** Passwords are never trimmed or transformed: spaces and any characters are allowed. */
export const newPasswordSchema = z
  .string({ error: "passwordRequired" })
  .min(1, { error: "passwordRequired" })
  .min(PASSWORD_MIN_LENGTH, { error: "passwordTooShort" })
  .max(PASSWORD_MAX_LENGTH, { error: "passwordTooLong" });

export const currentPasswordSchema = z
  .string({ error: "passwordRequired" })
  .min(1, { error: "passwordRequired" })
  .max(PASSWORD_MAX_LENGTH, { error: "passwordTooLong" });

const captchaSchema = z.string().max(4096).optional();

export const ageSchema = z.object({
  adult: z.enum(["yes", "no"], { error: "ageRequired" }),
});

export const consentSchema = z.object({
  termsPrivacy: z.literal("on", { error: "consentTermsRequired" }),
  sensitiveData: z.literal("on", { error: "consentSensitiveRequired" }),
  timezone: z.string().max(64).optional(),
});

export const emailSignUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  captchaToken: captchaSchema,
});

export const passwordSignInSchema = z.object({
  email: emailSchema,
  password: currentPasswordSchema,
  captchaToken: captchaSchema,
  next: z.string().max(200).optional(),
});

export const emailOnlySchema = z.object({
  email: emailSchema,
  captchaToken: captchaSchema,
  next: z.string().max(200).optional(),
});

export const newPasswordFormSchema = z.object({
  password: newPasswordSchema,
});

export type FieldName =
  | "adult"
  | "termsPrivacy"
  | "sensitiveData"
  | "email"
  | "password"
  | "code"
  | "recoveryCode"
  | "passkeyName";

/** First error message key for each field, from a failed parse. */
export function fieldErrors(error: z.ZodError): Partial<Record<FieldName, AuthErrorKey>> {
  const out: Partial<Record<FieldName, AuthErrorKey>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    // Every schema message above is an AuthErrorKey (checked by schemas.test.ts).
    if (typeof field === "string" && !(field in out)) out[field as FieldName] = issue.message as AuthErrorKey;
  }
  return out;
}

/** Only same-site, absolute paths are accepted as a post-sign-in destination. */
export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    if (url.pathname.startsWith("/api/")) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
