// @vitest-environment node
import { createECDH } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadNoteKey, openOfflineNote, currentNoteKey } from "@/lib/security/offline-note-keys";

import { isSealedNote, openSealedNote, sealedKeyId, sealedNoteContext, sealNote } from "./sealed-note";

/** A fresh private scalar, generated at run time (gitleaks: no keys in the repo). */
function scalar(): string {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const key = ecdh.getPrivateKey();
  return Buffer.concat([Buffer.alloc(32 - key.length), key]).toString("base64url");
}

const user = "00000000-0000-7000-8000-000000000001";
const ctx = sealedNoteContext(user, "2026-10-27");

describe("sealed offline notes (D-123)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("the device seals, only the server's key opens", async () => {
    const server = await loadNoteKey(scalar());
    const sealed = await sealNote("Long day. Called Sam instead.", server, ctx);
    expect(isSealedNote(sealed)).toBe(true);
    expect(sealed).not.toContain("Sam");
    expect(sealedKeyId(sealed)).toBe(server.kid);
    await expect(openSealedNote(sealed, server.privateKey, server.kid, ctx)).resolves.toBe(
      "Long day. Called Sam instead.",
    );
  });

  it("two seals of the same note differ (fresh one-time key and IV)", async () => {
    const server = await loadNoteKey(scalar());
    const a = await sealNote("same", server, ctx);
    const b = await sealNote("same", server, ctx);
    expect(a).not.toBe(b);
  });

  it("refuses a note moved to another day or person", async () => {
    const server = await loadNoteKey(scalar());
    const sealed = await sealNote("note", server, ctx);
    await expect(
      openSealedNote(sealed, server.privateKey, server.kid, sealedNoteContext(user, "2026-10-26")),
    ).rejects.toThrow();
    await expect(
      openSealedNote(
        sealed,
        server.privateKey,
        server.kid,
        sealedNoteContext("00000000-0000-7000-8000-000000000002", "2026-10-27"),
      ),
    ).rejects.toThrow();
  });

  it("refuses a changed note and another server's key", async () => {
    const server = await loadNoteKey(scalar());
    const other = await loadNoteKey(scalar());
    const sealed = await sealNote("note", server, ctx);
    // A character well inside the ciphertext (the last one may only carry padding bits).
    const at = sealed.length - 6;
    const tampered = sealed.slice(0, at) + (sealed[at] === "A" ? "B" : "A") + sealed.slice(at + 1);
    await expect(openSealedNote(tampered, server.privateKey, server.kid, ctx)).rejects.toThrow();
    await expect(openSealedNote(sealed, other.privateKey, other.kid, ctx)).rejects.toThrow();
  });

  it("handles the longest note and any language", async () => {
    const server = await loadNoteKey(scalar());
    const note = "प्रार्थना 🙏 ".repeat(90).slice(0, 1000);
    const sealed = await sealNote(note, server, ctx);
    expect(isSealedNote(sealed)).toBe(true);
    await expect(openSealedNote(sealed, server.privateKey, server.kid, ctx)).resolves.toBe(note);
  });

  it("the server opens with the current or the previous key, and returns null otherwise", async () => {
    const oldScalar = scalar();
    const newScalar = scalar();
    const oldKey = await loadNoteKey(oldScalar);
    const sealedOld = await sealNote("from before the change", oldKey, ctx);

    vi.stubEnv("OFFLINE_NOTE_PRIVATE_KEY", newScalar);
    vi.stubEnv("OFFLINE_NOTE_PREVIOUS_PRIVATE_KEY", oldScalar);
    const current = await currentNoteKey();
    expect(current?.kid).toBe((await loadNoteKey(newScalar)).kid);
    await expect(openOfflineNote(sealedOld, ctx)).resolves.toBe("from before the change");
    const sealedNew = await sealNote("after", current!, ctx);
    await expect(openOfflineNote(sealedNew, ctx)).resolves.toBe("after");

    vi.stubEnv("OFFLINE_NOTE_PREVIOUS_PRIVATE_KEY", "");
    await expect(openOfflineNote(sealedOld, ctx)).resolves.toBeNull();
    await expect(openOfflineNote("not sealed", ctx)).resolves.toBeNull();
  });

  it("no key set: sealed notes are off", async () => {
    vi.stubEnv("OFFLINE_NOTE_PRIVATE_KEY", "");
    vi.stubEnv("OFFLINE_NOTE_PREVIOUS_PRIVATE_KEY", "");
    await expect(currentNoteKey()).resolves.toBeNull();
  });
});
