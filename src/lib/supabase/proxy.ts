import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieOptions } from "./cookies";
import type { Database } from "./database.types";

/** App areas that need a signed-in account. Everything else is public. */
const protectedPrefixes = ["/home", "/groups", "/check-in", "/alerts", "/me", "/settings", "/welcome"];
/** Sign-in and sign-up entry pages a signed-in person doesn't need to see. */
const signedOutOnly = ["/sign-in", "/sign-up"];

/** Strips a locale prefix (/hi/home → /home); English URLs have none. */
function appPath(pathname: string, locales: readonly string[]): string {
  const [, first, ...rest] = pathname.split("/");
  return first && locales.includes(first) ? `/${rest.join("/")}` : pathname;
}

function matches(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session on every page request (rotating the
 * refresh token when the access token is near expiry) and writes the new
 * cookies onto `response`. Then decides whether the request should be
 * redirected:
 *
 *  - a protected page without a session → /sign-in?next=…
 *  - /sign-in or /sign-up (exactly) with a session → /home
 *
 * This is a convenience, not the security boundary: every page and Server
 * Action checks the account again (requireAccount), and RLS checks it once
 * more in the database.
 */
export async function refreshSessionAndGate(
  request: NextRequest,
  response: NextResponse,
  locales: readonly string[],
): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    signedIn = false;
  }

  const path = appPath(request.nextUrl.pathname, locales);
  let redirectTo: URL | undefined;
  if (!signedIn && matches(path, protectedPrefixes)) {
    redirectTo = new URL("/sign-in", request.url);
    redirectTo.searchParams.set("next", `${path}${request.nextUrl.search}`);
  } else if (signedIn && signedOutOnly.includes(path)) {
    redirectTo = new URL("/home", request.url);
  }
  if (!redirectTo) return response;

  const redirect = NextResponse.redirect(redirectTo);
  // Keep any refreshed session cookies and the security headers.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  const csp = response.headers.get("Content-Security-Policy");
  if (csp) redirect.headers.set("Content-Security-Policy", csp);
  return redirect;
}
