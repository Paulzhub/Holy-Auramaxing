/**
 * The site's address and identity, kept identical everywhere (§12 GEO: the
 * same name and description on the site, in JSON-LD, llms.txt and listings).
 */
export const SITE_NAME = "Holy Auramaxing";

/** The canonical origin, without a trailing slash. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** An absolute URL for a site path ("/faq" → "https://…/faq"). */
export function absoluteUrl(path: string): string {
  return path === "/" ? `${siteUrl()}/` : `${siteUrl()}${path}`;
}

/** The public contact for privacy, grievances and security reports (legal.privacy, §11). */
export const CONTACT_EMAIL = "paulangelogamer@gmail.com";
