import createIntlMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { refreshSessionAndGate } from "@/lib/supabase/proxy";

const handleI18nRouting = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    upgradeInsecure: request.nextUrl.protocol === "https:",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    turnstile: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  });

  // Next.js reads the nonce from the request's CSP header and applies it to
  // its own scripts; our layout reads x-nonce for the theme boot script.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const forwarded = new NextRequest(request, { headers });
  const response = handleI18nRouting(forwarded);
  response.headers.set("Content-Security-Policy", csp);
  // Pages that depend on who is signed in must never be stored by shared caches.
  response.headers.set("Cache-Control", "private, no-store");

  return refreshSessionAndGate(forwarded, response, routing.locales);
}

export const config = {
  // Pages only: skip API routes, Next internals and files with an extension.
  // Prefetches must still pass through, because next-intl rewrites
  // unprefixed English URLs (/home) to their locale segment (/en/home).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
