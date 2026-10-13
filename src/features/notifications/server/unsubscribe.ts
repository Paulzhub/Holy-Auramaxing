import { createHmac, timingSafeEqual } from "node:crypto";

import { derivedKey } from "@/lib/security/encryption";

import { isNotificationType } from "../constants";

/**
 * One-click unsubscribe links (RFC 8058, D-092). The link names the person
 * and the type, signed with a key derived from APP_ENCRYPTION_KEY, so it
 * can't be forged or changed to another person or type. It needs no
 * session: it works from any mail client.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UnsubscribeKind = string; // a notification type, or "digest"

function signature(userId: string, kind: UnsubscribeKind): string {
  return createHmac("sha256", derivedKey("notification-unsubscribe-v1"))
    .update(`${userId.toLowerCase()}:${kind}`)
    .digest("base64url");
}

export function unsubscribeQuery(userId: string, kind: UnsubscribeKind): string {
  return new URLSearchParams({ u: userId, t: kind, s: signature(userId, kind) }).toString();
}

/** The person and type of a valid link, or null. */
export function verifyUnsubscribe(params: {
  u?: string | null;
  t?: string | null;
  s?: string | null;
}): { userId: string; kind: UnsubscribeKind } | null {
  const { u, t, s } = params;
  if (!u || !t || !s || !UUID.test(u) || !(t === "digest" || isNotificationType(t)) || s.length > 60) return null;
  const expected = Buffer.from(signature(u, t));
  const given = Buffer.from(s);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId: u.toLowerCase(), kind: t };
}
