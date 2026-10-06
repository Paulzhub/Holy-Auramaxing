import { z } from "zod";

import { PASSKEY_NAME_MAX_LENGTH } from "./security-state";

// Server-side validation for two-step sign-in, passkeys and sessions (Phase 2d).
// Messages are keys under "auth.errors".

/** Six digits; spaces people type between groups are ignored. */
export const totpCodeSchema = z
  .string({ error: "codeRequired" })
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(
    z
      .string()
      .min(1, { error: "codeRequired" })
      .regex(/^\d{6}$/, { error: "codeInvalid" }),
  );

export const recoveryCodeInputSchema = z
  .string({ error: "recoveryCodeRequired" })
  .trim()
  .min(1, { error: "recoveryCodeRequired" })
  .max(40, { error: "recoveryCodeInvalid" });

export const passkeyNameSchema = z
  .string({ error: "passkeyNameRequired" })
  .trim()
  .min(1, { error: "passkeyNameRequired" })
  .max(PASSKEY_NAME_MAX_LENGTH, { error: "passkeyNameTooLong" });

export const idSchema = z.uuid();

const base64url = z
  .string()
  .max(16_384)
  .regex(/^[A-Za-z0-9_-]*$/);

/**
 * A credential from navigator.credentials (its toJSON() form). The auth
 * server checks every byte; this only bounds the shape and size.
 */
export const passkeyCredentialSchema = z.object({
  id: base64url.min(1).max(1024),
  rawId: base64url.min(1).max(1024),
  type: z.literal("public-key"),
  response: z.record(
    z.string().max(64),
    z.union([base64url, z.array(z.string().max(32)).max(16), z.number(), z.null()]),
  ),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).nullish(),
  clientExtensionResults: z.record(z.string().max(64), z.unknown()).default({}),
});

export const passkeyFinishSchema = z.object({
  challengeId: idSchema,
  credential: passkeyCredentialSchema,
  next: z.string().max(200).optional(),
});
