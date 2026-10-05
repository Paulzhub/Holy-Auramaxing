import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

import { sessionCookieOptions } from "./cookies";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Uses the publishable key, so every query runs as the signed-in user and is
 * limited by row-level security. The secret key is never used here.
 */
export async function createSupabaseServerClient() {
  const env = readPublicEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local (see README).");
  }
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy (src/proxy.ts) refreshes the session before rendering.
        }
      },
    },
  });
}

export function isSupabaseConfigured(): boolean {
  const env = readPublicEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
