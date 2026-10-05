import { createHash, randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

/**
 * Helpers that talk to the local Supabase stack (`npx supabase start`) and its
 * Mailpit inbox. Only for tests: they use the secret key.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
export const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export function admin() {
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required for e2e tests (see README).");
  return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${randomUUID().slice(0, 8)}@example.test`;
}

/** A long, random password that no breach list contains. */
export function strongPassword(): string {
  return `Quiet morning ${randomBytes(6).toString("hex")} by the river`;
}

/** Creates a confirmed account through the real sign-up ticket path. */
export async function createConfirmedUser(email: string, password: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const client = admin();
  const { error: ticketError } = await client.rpc("create_signup_ticket", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_policy_version: "e2e",
    p_timezone: "Asia/Kolkata",
    p_ttl_minutes: 5,
  });
  if (ticketError) throw ticketError;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { signup_ticket: token },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  return data.user.id;
}

export async function findUserId(email: string): Promise<string | undefined> {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email)?.id;
}

export async function countAuthUsers(): Promise<number> {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  return data.users.length;
}

interface MailpitSummary {
  ID: string;
  Subject: string;
  Created: string;
}

/** Waits for the newest email to `to` whose subject matches, and returns its /confirm link. */
export async function waitForEmailLink(
  to: string,
  subject: RegExp,
  timeoutMs = 15_000,
): Promise<{ subject: string; link: URL; html: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: MailpitSummary[] };
      const match = messages.find((m) => subject.test(m.Subject));
      if (match) {
        const message = (await (await fetch(`${mailpitUrl}/api/v1/message/${match.ID}`)).json()) as { HTML: string };
        const href = /href="([^"]*\/confirm\?[^"]+)"/.exec(message.HTML)?.[1];
        if (!href) throw new Error(`No /confirm link in "${match.Subject}"`);
        return { subject: match.Subject, link: new URL(href.replaceAll("&amp;", "&")), html: message.HTML };
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No email to ${to} matching ${subject}`);
}

/** Can this machine reach the Have I Been Pwned range API? (Blocked in some sandboxes.) */
export async function hibpReachable(): Promise<boolean> {
  try {
    const res = await fetch("https://api.pwnedpasswords.com/range/5BAA6", { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
