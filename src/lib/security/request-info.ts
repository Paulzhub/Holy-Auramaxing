import { headers } from "next/headers";

const TRUSTED_HEADERS = ["x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for", "cf-connecting-ip"] as const;
type TrustedHeader = (typeof TRUSTED_HEADERS)[number];

function trustedHeader(): TrustedHeader {
  const configured = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  return (TRUSTED_HEADERS as readonly string[]).includes(configured ?? "")
    ? (configured as TrustedHeader)
    : "x-forwarded-for";
}

/**
 * The client's IP address, used only as a rate-limit key (hashed before
 * storage) and never logged.
 *
 * Only a header the platform in front of us writes is trusted (D-052):
 *  - X-Forwarded-For (default): the LAST entry, the one appended by the
 *    proxy nearest to us. Earlier entries are whatever the client sent, so
 *    reading the first one let anyone pick a fresh "address" per request.
 *    Vercel replaces the header with the real address, which is then the
 *    only (and last) entry.
 *  - Behind Cloudflare (TRUSTED_IP_HEADER=cf-connecting-ip): Cloudflare's
 *    own header. X-Forwarded-For there names Cloudflare's servers, so every
 *    visitor behind one data centre would share a single limit.
 * Headers we weren't told to trust are ignored; with nothing usable, every
 * such request shares the key "unknown" rather than one the client chose.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const name = trustedHeader();
  const value = h.get(name);
  if (!value) return "unknown";
  const entries = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return entries.at(-1) ?? "unknown";
}

/** A coarse, non-identifying description of the browser for audit entries. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "unknown";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Other browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";
  return `${browser} on ${os}`;
}
