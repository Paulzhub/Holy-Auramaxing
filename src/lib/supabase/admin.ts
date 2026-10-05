import { createClient } from "@supabase/supabase-js";

import { readPublicEnv, readServerEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Supabase client with the secret key. It bypasses row-level security, so use
 * it only in server code, only for the narrow jobs that need it (issuing
 * sign-up tickets, finishing Google sign-ups, writing the audit log, deleting
 * an orphaned auth user), and never with input you haven't validated.
 *
 * The secret key has no NEXT_PUBLIC_ prefix, so Next.js never bundles it into
 * browser code, and readServerEnv() throws if called in a browser.
 */
export function createSupabaseAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url } = readPublicEnv();
  const { SUPABASE_SECRET_KEY: key } = readServerEnv();
  if (!url || !key) {
    throw new Error("Supabase admin client is not configured (SUPABASE_SECRET_KEY). See README.");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
