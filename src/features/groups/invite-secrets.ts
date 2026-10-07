import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

import { derivedKey } from "@/lib/security/encryption";

/**
 * Invite secrets (CLAUDE.md §7.4, D-037). Server only.
 *
 *  - Link token: 160 random bits as 27 base64url characters, carried in the
 *    link and the QR code. Stored only as its SHA-256.
 *  - Short code: 10 characters of Crockford base32 (50 bits), shown as
 *    "ABCDE-FGHJK" for typing in. Stored only as HMAC-SHA256 with a key
 *    derived from APP_ENCRYPTION_KEY, so a database copy alone can't be used
 *    to try codes. 50 bits is plenty with the attempt limit (5 wrong codes
 *    per 15 minutes, per person and per network).
 *
 * Neither is ever stored or logged in the clear; admins see them once, when
 * the invite is made.
 */

const TOKEN_BYTES = 20;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{27}$/;
const CODE_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const CODE_LENGTH = 10;

export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isInviteToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * As typed → canonical, or null if it can't be a code. Case, spaces and
 * dashes are ignored, and the letters people confuse with digits are read
 * as those digits (Crockford: o → 0, i and l → 1).
 */
export function normaliseInviteCode(input: string): string | null {
  const code = input.toLowerCase().replace(/[\s-]/g, "").replace(/o/g, "0").replace(/[il]/g, "1");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

export function hashInviteCode(code: string): string {
  return createHmac("sha256", derivedKey("group-invite-codes-v1")).update(code).digest("hex");
}

/** "abcde12345" → "ABCDE-12345", for display. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`.toUpperCase();
}

export function inviteLink(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}
