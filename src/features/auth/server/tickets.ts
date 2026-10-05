import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { POLICY_VERSION, SIGNUP_ADULT_COOKIE, SIGNUP_TICKET_COOKIE, SIGNUP_TICKET_TTL_MINUTES } from "../policy";

const cookieBase = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SIGNUP_TICKET_TTL_MINUTES * 60,
};

/** Remembers, for the next step only, that this visitor said they are 18 or older. */
export async function rememberAdultAnswer(): Promise<void> {
  (await cookies()).set(SIGNUP_ADULT_COOKIE, "1", cookieBase);
}

export async function hasAdultAnswer(): Promise<boolean> {
  return (await cookies()).get(SIGNUP_ADULT_COOKIE)?.value === "1";
}

/**
 * Issues a sign-up ticket after the age and consent steps. The browser keeps
 * the random token in an httpOnly cookie; the database keeps only its hash.
 */
export async function issueSignupTicket(timezone: string | undefined): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error } = await createSupabaseAdminClient().rpc("create_signup_ticket", {
    p_token_hash: tokenHash,
    p_policy_version: POLICY_VERSION,
    p_timezone: timezone || "UTC",
    p_ttl_minutes: SIGNUP_TICKET_TTL_MINUTES,
  });
  if (error) throw new Error("Could not issue a sign-up ticket.");

  const jar = await cookies();
  jar.set(SIGNUP_TICKET_COOKIE, token, cookieBase);
  jar.delete(SIGNUP_ADULT_COOKIE);
}

export async function readSignupTicket(): Promise<string | undefined> {
  const value = (await cookies()).get(SIGNUP_TICKET_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

export async function clearSignupCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(SIGNUP_TICKET_COOKIE);
  jar.delete(SIGNUP_ADULT_COOKIE);
}
