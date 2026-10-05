import { redirect } from "next/navigation";
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  /** null when signed in but the account was never completed (see D-014). */
  profile: AccountProfile | null;
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

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    profile: profile ?? null,
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
  // Signed in, but sign-up was never finished: sign out and start again.
  if (!account.profile) redirect("/api/auth/sign-out?reason=incomplete");
  return account as Account & { profile: AccountProfile };
}
