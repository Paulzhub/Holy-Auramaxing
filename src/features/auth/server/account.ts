import { redirect } from "next/navigation";
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { readAuthGate } from "./security-events";

export interface AccountProfile {
  id: string;
  handle: string;
  display_name: string | null;
  theme_pref: "light" | "dark" | "system";
  timezone: string;
  onboarded_at: string | null;
  deletion_requested_at: string | null;
}

export interface Account {
  userId: string;
  email: string | null;
  /** null when signed in but the account was never completed (see D-014), or blocked (below). */
  profile: AccountProfile | null;
  /**
   * Why the database refused this session, if it did (util.session_ok):
   * "mfa" = the authenticator code hasn't been entered yet (D-028);
   * "ended" = this session was signed out from another device (D-030).
   */
  blocked: "mfa" | "ended" | null;
}

/**
 * The signed-in user and their profile, or null when signed out. The JWT is
 * verified (getClaims), and the profile is read through RLS as that user.
 * Cached for the duration of one request.
 */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name, theme_pref, timezone, onboarded_at, deletion_requested_at")
    .eq("id", claims.sub)
    .maybeSingle<AccountProfile>();

  // Row-level security hides the profile when the session has ended or
  // still needs its two-step code. Only then is it worth asking which.
  let blocked: Account["blocked"] = null;
  if (!profile) {
    const gate = await readAuthGate(supabase);
    blocked = !gate.sessionActive ? "ended" : gate.mfaPending ? "mfa" : null;
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    profile: profile ?? null,
    blocked,
  };
});

/**
 * For pages inside the app: returns a complete account or redirects.
 * Server Actions must call this too (or getAccount) rather than trusting
 * that the proxy already checked.
 */
export async function requireAccount(): Promise<Account & { profile: AccountProfile }> {
  const account = await getAccount();
  if (!account) redirect("/sign-in");
  // Two-step sign-in is on and the code hasn't been entered yet.
  if (account.blocked === "mfa") redirect("/sign-in/verify");
  // Signed out from another device: clear this browser's cookies too.
  if (account.blocked === "ended") redirect("/api/auth/sign-out?reason=ended");
  // Signed in, but sign-up was never finished: sign out and start again.
  if (!account.profile) redirect("/api/auth/sign-out?reason=incomplete");
  return account as Account & { profile: AccountProfile };
}

/** Where the code page (/sign-in/verify) stands for this browser. */
export async function getTwoStepStatus(): Promise<"signed-out" | "ended" | "pending" | "done"> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return "signed-out";
  const gate = await readAuthGate(supabase);
  if (!gate.sessionActive) return "ended";
  return gate.mfaPending ? "pending" : "done";
}
