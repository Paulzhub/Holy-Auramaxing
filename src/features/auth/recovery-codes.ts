import { createHmac, randomInt } from "node:crypto";

import { derivedKey } from "@/lib/security/encryption";

/**
 * Two-factor recovery codes (D-028). Ten single-use codes, each 10
 * characters of Crockford base32 (50 bits), shown once as "xxxxx-xxxxx".
 * Stored only as HMAC-SHA256 with a key derived from APP_ENCRYPTION_KEY and
 * bound to the user id, so a database copy alone can't be used to guess
 * them. Server-only.
 */
export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const LENGTH = 10;

export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) {
    let code = "";
    for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    codes.add(code);
  }
  return [...codes];
}

/** "abcde12345" → "abcde-12345", for display. */
export function formatRecoveryCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/**
 * As typed → canonical, or null if it can't be a code. Case, spaces and
 * dashes are ignored, and the letters people confuse with digits are
 * read as those digits (Crockford: o → 0, i and l → 1).
 */
export function normaliseRecoveryCode(input: string): string | null {
  const code = input
    .toLowerCase()
    .replace(/[\s-]/g, "")
    .replace(/o/g, "0")
    .replace(/[il]/g, "1");
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

export function hashRecoveryCode(userId: string, code: string): string {
  return createHmac("sha256", derivedKey("mfa-recovery-codes-v1")).update(`${userId}:${code}`).digest("hex");
}
