import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { after } from "next/server";

import { renderSecurityEmail, type SecurityEmailKind } from "@/emails/security-alert";
import { siteOrigin } from "@/lib/env";
import { sendEmail } from "@/lib/email/sender";
import { describeUserAgent } from "@/lib/security/request-info";
import { devLog } from "@/lib/server/dev-log";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * What happens around a sign-in (D-030):
 *
 *  - A random device cookie (httpOnly, about 400 days) tells this browser
 *    apart from others. Only its SHA-256 is stored, with a coarse label
 *    such as "Chrome on Windows". No IP addresses, no fingerprinting.
 *  - Each session is linked to its device for the sessions page.
 *  - The first sign-in on a device an account has never used sends a
 *    "New sign-in" email. It is sent after the password (or link, or
 *    passkey) step, before two-step sign-in, so someone who only has the
 *    password is noticed too.
 */
export const DEVICE_COOKIE = "aura_device";
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

async function deviceHash(): Promise<string> {
  const jar = await cookies();
  let token = jar.get(DEVICE_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    token = randomBytes(32).toString("base64url");
    jar.set(DEVICE_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }
  return createHash("sha256").update(token).digest("base64url");
}

/** The session id inside an access token we were just given by Supabase. */
function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      session_id?: unknown;
    };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

async function currentDeviceLabel(): Promise<string> {
  try {
    return describeUserAgent((await headers()).get("user-agent"));
  } catch {
    return "unknown";
  }
}

/**
 * Call after every successful first step of a sign-in. Never throws: a
 * bookkeeping failure must not stop someone signing in.
 */
export async function recordSignIn(input: {
  userId: string;
  email: string | null | undefined;
  accessToken: string | null | undefined;
}): Promise<void> {
  try {
    const sessionId = input.accessToken ? sessionIdOf(input.accessToken) : null;
    if (!sessionId) return;
    const [hash, label] = await Promise.all([deviceHash(), currentDeviceLabel()]);
    const { data, error } = await createSupabaseAdminClient().rpc("record_session_device", {
      p_user_id: input.userId,
      p_session_id: sessionId,
      p_device_hash: hash,
      p_label: label,
    });
    if (error) throw error;
    if (data === "new" && input.email) {
      const email = input.email;
      after(() => sendSecurityAlert({ kind: "newSignIn", userId: input.userId, email, device: label }));
    }
  } catch (error) {
    devLog("security", error);
  }
}

/** Queue a security email for after the response (Phase 7's job queue takes over). */
export async function queueSecurityAlert(
  kind: SecurityEmailKind,
  userId: string,
  email: string | null | undefined,
  extra: { closesOn?: Date } = {},
) {
  if (!email) return;
  const device = await currentDeviceLabel();
  after(() => sendSecurityAlert({ kind, userId, email, device, ...extra }));
}

async function sendSecurityAlert(input: {
  kind: SecurityEmailKind;
  userId: string;
  email: string;
  device: string;
  closesOn?: Date;
}) {
  try {
    const { data } = await createSupabaseAdminClient()
      .from("profiles")
      .select("timezone")
      .eq("id", input.userId)
      .maybeSingle();
    const message = await renderSecurityEmail({
      kind: input.kind,
      device: input.device,
      when: new Date(),
      timeZone: data?.timezone ?? "UTC",
      siteOrigin: siteOrigin(),
      closesOn: input.closesOn,
    });
    await sendEmail({ to: input.email, ...message });
  } catch (error) {
    devLog("security", error);
  }
}

export interface AuthGate {
  sessionActive: boolean;
  mfaPending: boolean;
}

/** Asks the database why a signed-in session might be refused (see util.session_ok). */
export async function readAuthGate(supabase: SupabaseClient<Database>): Promise<AuthGate> {
  const { data, error } = await supabase.rpc("auth_gate").maybeSingle();
  if (error || !data) return { sessionActive: true, mfaPending: false };
  return { sessionActive: data.session_active, mfaPending: data.mfa_pending };
}

/** Where to go after the first step of a sign-in: the code page, or on. */
export function afterFirstStep(next: string, gate: AuthGate): string {
  return gate.mfaPending ? `/sign-in/verify?next=${encodeURIComponent(next)}` : next;
}
