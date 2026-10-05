import { headers } from "next/headers";

/**
 * The client's IP address, used only as a rate-limit key (hashed before
 * storage) and never logged. Behind Vercel or Cloudflare the first
 * X-Forwarded-For entry is set by the platform; locally it may be missing.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown";
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
