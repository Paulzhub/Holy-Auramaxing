"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for Client Components. Reads go through row-level security. */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local (see README).");
  }
  return createBrowserClient(url, key);
}
