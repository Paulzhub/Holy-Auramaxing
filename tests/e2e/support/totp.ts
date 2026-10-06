import { createHmac } from "node:crypto";

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), as authenticator apps compute it. Test-only. */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secretBase32.replace(/[\s=]/g, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error(`Not base32: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[19]! & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/**
 * A code from a time step that hasn't been used yet. Authentication servers
 * refuse a code twice in the same 30-second step, so after `usedAt` this
 * waits for the next step if needed.
 */
export async function freshTotp(secret: string, usedAt?: number): Promise<string> {
  if (usedAt !== undefined) {
    const usedStep = Math.floor(usedAt / 30_000);
    while (Math.floor(Date.now() / 30_000) <= usedStep) await new Promise((r) => setTimeout(r, 500));
  }
  return totp(secret);
}
