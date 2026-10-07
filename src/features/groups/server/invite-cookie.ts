import { cookies } from "next/headers";

/**
 * The invite someone is holding, between opening the link (or typing the
 * code) and joining. It survives sign-up and onboarding, so a new person
 * lands back on the invite (D-037).
 *
 * Only the hash is kept, never the token or code: "t.<sha256>" for a link,
 * "c.<hmac>" for a code. httpOnly, so page scripts can't read it, and it
 * lasts an hour.
 */
export const INVITE_COOKIE = "aura_invite";
const MAX_AGE_SECONDS = 60 * 60;

export interface HeldInvite {
  tokenHash: string | null;
  codeHash: string | null;
}

const PATTERN = /^([tc])\.([0-9a-f]{64})$/;

export function encodeHeldInvite(kind: "token" | "code", hash: string): string {
  return `${kind === "token" ? "t" : "c"}.${hash}`;
}

export function decodeHeldInvite(value: string | undefined): HeldInvite | null {
  const match = value ? PATTERN.exec(value) : null;
  if (!match) return null;
  return match[1] === "t" ? { tokenHash: match[2]!, codeHash: null } : { tokenHash: null, codeHash: match[2]! };
}

export const inviteCookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: MAX_AGE_SECONDS,
};

export async function holdInvite(kind: "token" | "code", hash: string): Promise<void> {
  (await cookies()).set(INVITE_COOKIE, encodeHeldInvite(kind, hash), inviteCookieOptions);
}

export async function readHeldInvite(): Promise<HeldInvite | null> {
  return decodeHeldInvite((await cookies()).get(INVITE_COOKIE)?.value);
}

export async function dropHeldInvite(): Promise<void> {
  (await cookies()).delete({ name: INVITE_COOKIE, path: "/" });
}
