/**
 * Sealed notes for check-ins made offline (CLAUDE.md §7.5, §13; D-123).
 *
 * The device can only *lock* a note, never open it again. The server
 * publishes one ECDH P-256 public key; while offline, the device makes a
 * one-time key pair, derives an AES-256-GCM key from it and the server's key
 * (HKDF-SHA-256), encrypts the note bound to the person and the day, and
 * throws its private half away. Only the server's private key
 * (OFFLINE_NOTE_PRIVATE_KEY) can open it, when the check-in is sent.
 *
 * Format: "s1.<kid>.<one-time public key, raw>.<iv>.<ciphertext+tag>", base64url.
 *
 * Plain Web Crypto, so the same file runs in the browser (seal) and in
 * Node (open, tests). No secrets live here.
 */

export const SEALED_VERSION = "s1";
const INFO = new TextEncoder().encode("ha-offline-note-v1");

/** The server's public key as the device stores it. */
export interface NoteKey {
  /** A short id of the key (base64url of the first 8 bytes of SHA-256 of the raw key). */
  kid: string;
  /** The public key, uncompressed raw point (65 bytes), base64url. */
  publicKey: string;
}

/** What the note is bound to: a sealed note can't be moved to another person or day. */
export function sealedNoteContext(userId: string, date: string): string {
  return `offline-note:${SEALED_VERSION}:${userId}:${date}`;
}

const sealedPattern = /^s1\.[A-Za-z0-9_-]{11}\.[A-Za-z0-9_-]{87}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;

/** Shape check only (the server still has to open it). */
export function isSealedNote(value: unknown): value is string {
  return typeof value === "string" && value.length <= 8000 && sealedPattern.test(value);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto is not available here.");
  return s;
}

/** The key id for a raw public key. */
export async function keyId(rawPublicKey: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await subtle().digest("SHA-256", rawPublicKey));
  return toBase64Url(digest.slice(0, 8));
}

async function aesKey(shared: ArrayBuffer, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: INFO }, base, { name: "AES-GCM", length: 256 }, false, [
    usage,
  ]);
}

/** Device side: lock a note so that only the server can open it. */
export async function sealNote(note: string, key: NoteKey, context: string): Promise<string> {
  const s = subtle();
  const serverKey = await s.importKey("raw", fromBase64Url(key.publicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const once = (await s.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])) as CryptoKeyPair;
  const shared = await s.deriveBits({ name: "ECDH", public: serverKey }, once.privateKey, 256);
  const oncePublic = new Uint8Array(await s.exportKey("raw", once.publicKey));
  const aes = await aesKey(shared, oncePublic, "encrypt");
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await s.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context), tagLength: 128 },
      aes,
      new TextEncoder().encode(note),
    ),
  );
  return [SEALED_VERSION, key.kid, toBase64Url(oncePublic), toBase64Url(iv), toBase64Url(ciphertext)].join(".");
}

/** The key id a sealed note was locked with, or null if it isn't one. */
export function sealedKeyId(sealed: string): string | null {
  return isSealedNote(sealed) ? (sealed.split(".")[1] ?? null) : null;
}

/**
 * Server side: open a sealed note with the private key whose id it names.
 * Throws if it was changed, moved to another person or day, or locked with
 * another key.
 */
export async function openSealedNote(sealed: string, privateKey: CryptoKey, kid: string, context: string): Promise<string> {
  if (!isSealedNote(sealed)) throw new Error("Not a sealed note.");
  const [, noteKid, oncePublicText, ivText, ciphertextText] = sealed.split(".") as [string, string, string, string, string];
  if (noteKid !== kid) throw new Error("Sealed with another key.");
  const s = subtle();
  const oncePublic = fromBase64Url(oncePublicText);
  const onceKey = await s.importKey("raw", oncePublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await s.deriveBits({ name: "ECDH", public: onceKey }, privateKey, 256);
  const aes = await aesKey(shared, oncePublic, "decrypt");
  const plain = await s.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivText), additionalData: new TextEncoder().encode(context), tagLength: 128 },
    aes,
    fromBase64Url(ciphertextText),
  );
  return new TextDecoder().decode(plain);
}
