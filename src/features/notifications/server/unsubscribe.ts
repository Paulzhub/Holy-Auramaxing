import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { derivedKey } from "@/lib/security/encryption";

import { isNotificationType } from "../constants";

/**
 * One-click unsubscribe links (RFC 8058, D-092). The link carries one opaque
 * value, `?k=`: the person and the type, encrypted and authenticated
 * (AES-256-GCM, a key derived from APP_ENCRYPTION_KEY). It can't be forged or
 * changed to another person or type, and it needs no session, so it works
 * from any mail client.
 *
 * Opaque, not just signed (privacy review 2, D-098): the link sits in the
 * email, in its List-Unsubscribe header, in the browser history once opened
 * and in the host's request logs. A readable `t=partner_sos` or
 * `t=streak_at_risk` there, next to the account's id, would say what the
 * app is about and whose account it is.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSE = "notification-unsubscribe-v2";
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** The longest token we ever make is about 90 characters. */
const MAX_TOKEN = 160;

export type UnsubscribeKind = string; // a notification type, or "digest"

export function unsubscribeToken(userId: string, kind: UnsubscribeKind): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(PURPOSE), iv, { authTagLength: TAG_BYTES });
  const plain = Buffer.concat([Buffer.from(userId.replace(/-/g, ""), "hex"), Buffer.from(kind, "utf8")]);
  const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
}

export function unsubscribeQuery(userId: string, kind: UnsubscribeKind): string {
  return new URLSearchParams({ k: unsubscribeToken(userId, kind) }).toString();
}

/** The person and type of a valid link, or null. */
export function verifyUnsubscribe(token: string | null | undefined): { userId: string; kind: UnsubscribeKind } | null {
  if (!token || token.length > MAX_TOKEN || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES + 16) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(PURPOSE), raw.subarray(0, IV_BYTES), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
    const hex = plain.subarray(0, 16).toString("hex");
    const userId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const kind = plain.subarray(16).toString("utf8");
    if (!UUID.test(userId) || !(kind === "digest" || isNotificationType(kind))) return null;
    return { userId, kind };
  } catch {
    return null;
  }
}

/**
 * The three links in a notification email, and the one-click address for its
 * List-Unsubscribe header. `path` is the notification's page in the app.
 */
export function notificationEmailLinks(
  origin: string,
  userId: string,
  kind: UnsubscribeKind,
  path: string,
): { open: string; unsubscribe: string; settings: string; oneClick: string } {
  const query = unsubscribeQuery(userId, kind);
  return {
    open: new URL(path, origin).toString(),
    unsubscribe: `${origin}/unsubscribe?${query}`,
    settings: `${origin}/settings/notifications`,
    oneClick: `${origin}/api/notify/unsubscribe?${query}`,
  };
}
