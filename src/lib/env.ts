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
  /**
   * Which service sends the app's own emails (D-030, D-031). Unset: resend with a key, else smtp with a host,
   * else mailpit with a URL, else none.
   */
  EMAIL_PROVIDER: z.enum(["resend", "smtp", "mailpit", "none"]).optional(),
  /** Sender, e.g. "Aura <hello@example.com>". Without a verified domain Resend only accepts onboarding@resend.dev. */
  EMAIL_FROM: z.string().min(3).max(200).optional(),
  /** Resend API key (server-only). */
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Local Mailpit inbox (development and tests). */
  MAILPIT_URL: z.url().optional(),
  /** SMTP server for EMAIL_PROVIDER=smtp, e.g. smtp.gmail.com (D-031). */
  SMTP_HOST: z.string().min(1).max(255).optional(),
  /** 465 (TLS from the start) or 587 (STARTTLS). Default 465. */
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).max(320).optional(),
  /** Server-only. For Gmail, an app password (not the account password). */
  SMTP_PASSWORD: z.string().min(1).max(1024).optional(),
  /** Bearer token for /api/cron/* (Vercel Cron sends it). Unset = those routes return 404 (D-033). */
  CRON_SECRET: z.string().min(1).max(256).optional(),
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
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    MAILPIT_URL: process.env.MAILPIT_URL || undefined,
    SMTP_HOST: process.env.SMTP_HOST || undefined,
    SMTP_PORT: process.env.SMTP_PORT || undefined,
    SMTP_USER: process.env.SMTP_USER || undefined,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
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

/**
 * Passkeys kill switch (D-029): on only when PASSKEYS_ENABLED=true. Read on
 * the server at run time, so it can be turned off without a rebuild.
 */
export function passkeysEnabled(): boolean {
  return process.env.PASSKEYS_ENABLED === "true";
}
