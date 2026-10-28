// Prints a new private key for sealed offline notes (D-123): set it as
// OFFLINE_NOTE_PRIVATE_KEY in .env.local (and on the host). Never reuse the
// VAPID key, and never commit it. To change keys later, move the old value to
// OFFLINE_NOTE_PREVIOUS_PRIVATE_KEY for 7 days (the offline limit).
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const key = ecdh.getPrivateKey();
process.stdout.write(`${Buffer.concat([Buffer.alloc(32 - key.length), key]).toString("base64url")}\n`);
