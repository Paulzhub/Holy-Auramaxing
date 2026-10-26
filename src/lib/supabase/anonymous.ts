import { createClient } from "@supabase/supabase-js";

import { readPublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Supabase client for the public website: the publishable key and no
 * cookies, so every query runs as the anonymous role and reads only
 * published content (CLAUDE.md §6). Public pages never look at who is
 * signed in, so they show the same thing to everyone (D-114).
 */
export function createSupabaseAnonymousClient() {
  const env = readPublicEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local (see README).");
  }
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
