/**
 * Session cookies (CLAUDE.md §7.1): httpOnly so page scripts can never read
 * the tokens, SameSite=Lax so they survive the redirect back from Google,
 * Secure in production. Nothing in the browser needs the session directly:
 * every Supabase call that needs it runs on the server.
 */
export function sessionCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}
