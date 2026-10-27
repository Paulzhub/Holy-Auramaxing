import { createECDH } from "node:crypto";

import { readServerEnv } from "@/lib/env";
import { keyId, openSealedNote, sealedKeyId, toBase64Url, type NoteKey } from "@/lib/offline/sealed-note";

/**
 * The server's keys for notes sealed on a device while offline (D-123).
 * OFFLINE_NOTE_PRIVATE_KEY is the current key; OFFLINE_NOTE_PREVIOUS_PRIVATE_KEY
 * (optional) still opens notes sealed before a change. Only the public half
 * ever leaves the server.
 */
interface LoadedKey {
  kid: string;
  publicKey: string;
  privateKey: CryptoKey;
}

const loaded = new Map<string, Promise<LoadedKey>>();

/** Builds the key pair from the 32-byte private scalar (base64url). */
export async function loadNoteKey(privateScalar: string): Promise<LoadedKey> {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(privateScalar, "base64url"));
  const raw = new Uint8Array(ecdh.getPublicKey());
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privateScalar,
    x: toBase64Url(raw.slice(1, 33)),
    y: toBase64Url(raw.slice(33, 65)),
    ext: false,
  };
  const privateKey = await globalThis.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  return { kid: await keyId(raw), publicKey: toBase64Url(raw), privateKey };
}

function cached(scalar: string): Promise<LoadedKey> {
  let entry = loaded.get(scalar);
  if (!entry) {
    entry = loadNoteKey(scalar);
    loaded.set(scalar, entry);
  }
  return entry;
}

async function keys(): Promise<LoadedKey[]> {
  const env = readServerEnv();
  const scalars = [env.OFFLINE_NOTE_PRIVATE_KEY, env.OFFLINE_NOTE_PREVIOUS_PRIVATE_KEY].filter(
    (s): s is string => typeof s === "string",
  );
  return Promise.all(scalars.map(cached));
}

/** The current public key for devices, or null when sealed notes are off (no key set). */
export async function currentNoteKey(): Promise<NoteKey | null> {
  const [current] = await keys();
  return current ? { kid: current.kid, publicKey: current.publicKey } : null;
}

/**
 * Opens a sealed note, or returns null if it can't be opened (an unknown or
 * retired key, or it was changed). The check-in is then saved without it.
 */
export async function openOfflineNote(sealed: string, context: string): Promise<string | null> {
  const kid = sealedKeyId(sealed);
  if (!kid) return null;
  const key = (await keys()).find((k) => k.kid === kid);
  if (!key) return null;
  try {
    return await openSealedNote(sealed, key.privateKey, key.kid, context);
  } catch {
    return null;
  }
}
