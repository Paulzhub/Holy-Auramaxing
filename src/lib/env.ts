import { z } from "zod";

/**
 * Public, non-secret configuration. Secrets are read only through
 * readServerEnv(), which is called only from server modules.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  /** Cloudflare Turnstile site key. When unset, auth forms render without the widget (local development). */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function readPublicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
  });
}

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  /** Skip the Have I Been Pwned lookup (offline development and sandboxed tests only). */
  HIBP_DISABLED: z.enum(["true", "false"]).optional(),
  /** 32 random bytes, base64. Encrypts private text such as "my why" (D-025). */
  APP_ENCRYPTION_KEY: z.string().min(1).optional(),
  /** Google Cloud Vision API key, restricted to the Vision API. Screens uploaded photos (D-026). */
  GOOGLE_CLOUD_VISION_API_KEY: z.string().min(1).optional(),
  /** Overrides the screener: "stub" approves everything (dev and CI only), "none" holds every photo. */
  IMAGE_SCREENING_PROVIDER: z.enum(["google", "stub", "none"]).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Server-only configuration. Never import the result into client code. */
export function readServerEnv(): ServerEnv {
  if (typeof window !== "undefined") throw new Error("readServerEnv() must not run in the browser.");
  return serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || undefined,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
    HIBP_DISABLED: process.env.HIBP_DISABLED || undefined,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY || undefined,
    GOOGLE_CLOUD_VISION_API_KEY: process.env.GOOGLE_CLOUD_VISION_API_KEY || undefined,
    IMAGE_SCREENING_PROVIDER: process.env.IMAGE_SCREENING_PROVIDER || undefined,
  });
}

/** /dev/components is on in development and when ENABLE_DEV_PAGES=true (CI). */
export function isDevPagesEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.ENABLE_DEV_PAGES === "true";
}

/** The site's own origin, for links in emails and OAuth redirects. */
export function siteOrigin(fallbackOrigin?: string): string {
  const configured = readPublicEnv().NEXT_PUBLIC_SITE_URL;
  return new URL(configured ?? fallbackOrigin ?? "http://localhost:3000").origin;
}
