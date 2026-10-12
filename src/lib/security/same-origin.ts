/**
 * CSRF check for route handlers that change something (CLAUDE.md §10): the
 * same check Server Actions make. Browsers send Origin with every POST, and
 * it must name this host; Sec-Fetch-Site, when sent, must say same-origin.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
