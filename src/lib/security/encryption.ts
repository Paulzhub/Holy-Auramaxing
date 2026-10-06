import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { readServerEnv } from "@/lib/env";

/**
 * Application-level encryption for private text ("my why" now; journal
 * entries and check-in notes later), CLAUDE.md §10. AES-256-GCM with a
 * random 96-bit IV per value; the auth tag detects any tampering.
 *
 * Stored format: "v1:<iv>:<tag>:<ciphertext>", all base64url. The version
 * prefix lets us rotate keys later (v2 = new key) without rewriting data at
 * once. The key lives only in APP_ENCRYPTION_KEY (32 random bytes, base64),
 * never in the database or Git. See docs/decisions.md D-025.
 */
const VERSION = "v1";

function key(): Buffer {
  const raw = readServerEnv().APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set (see .env.example).");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return buf;
}

/** `context` (e.g. the user id) is bound into the tag, so a value can't be moved to another row. */
export function encryptText(plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptText(stored: string, context: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Unknown encrypted format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * A separate 32-byte key for one purpose (e.g. "mfa-recovery-codes-v1"),
 * derived from APP_ENCRYPTION_KEY with HKDF-SHA256, so one secret serves
 * several jobs without the same key being reused for different things.
 */
export function derivedKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", key(), Buffer.alloc(0), Buffer.from(purpose, "utf8"), 32));
}
