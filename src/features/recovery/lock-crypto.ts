/**
 * The app lock's PIN hash and device check (D-113), with the browser's own
 * Web Crypto and WebAuthn: no packages, and nothing leaves the device.
 */
import { PBKDF2_ITERATIONS } from "@/lib/app-lock";

const enc = new TextEncoder();

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const s = atob(value);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** A new PIN: PBKDF2-SHA-256 with a fresh 16-byte salt. */
export async function hashPin(
  pin: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ salt: string; hash: string; iterations: number }> {
  const salt = randomBytes(16);
  return { salt: toBase64(salt), hash: toBase64(await derive(pin, salt, iterations)), iterations };
}

/** Compares every byte, so the time taken says nothing about how close a guess was. */
export async function checkPin(pin: string, stored: { salt: string; hash: string; iterations: number }) {
  const got = await derive(pin, fromBase64(stored.salt), stored.iterations);
  const want = fromBase64(stored.hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ want[i]!;
  return diff === 0;
}

/** Can this device check a fingerprint or face (a platform authenticator with user verification)? */
export async function deviceCheckAvailable(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== "undefined" &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

/**
 * Adds a fingerprint or face check for the lock: a platform credential that
 * only this device holds. It is never sent to the server and has nothing to
 * do with signing in (passkeys for sign-in are separate, Phase 2d).
 */
export async function createDeviceCheck(appName: string): Promise<string | null> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: appName, id: location.hostname },
      user: { id: randomBytes(16), name: appName, displayName: appName },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  return credential ? toBase64(new Uint8Array(credential.rawId)) : null;
}

/** Asks the device to check the person (fingerprint, face or the device's own PIN). */
export async function runDeviceCheck(credentialId: string): Promise<boolean> {
  const result = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: fromBase64(credentialId) }],
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!result) return false;
  const flags = new Uint8Array((result.response as AuthenticatorAssertionResponse).authenticatorData)[32] ?? 0;
  // Bit 2: the device verified the person, not just that someone was present.
  return (flags & 0x04) !== 0;
}
