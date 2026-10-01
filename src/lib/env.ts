import { z } from "zod";

/**
 * Public, non-secret configuration. Secrets (SUPABASE_SECRET_KEY) are read
 * only in server modules that need them and are never imported here.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function readPublicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
  });
}

/** /dev/components is on in development and when ENABLE_DEV_PAGES=true (CI). */
export function isDevPagesEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.ENABLE_DEV_PAGES === "true";
}
