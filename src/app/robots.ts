import type { MetadataRoute } from "next";

import { AI_CRAWLERS, NEVER_CRAWLED } from "@/features/marketing/pages";
import { absoluteUrl } from "@/features/marketing/site";

/**
 * robots.txt (CLAUDE.md §12, D-119): public pages may be crawled by everyone,
 * the named AI crawlers included; the signed-in app, invites, the API and
 * the dev pages may not. Indexing itself is decided by noindex (meta tag and
 * X-Robots-Tag), which is why the noindex auth pages stay crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [...NEVER_CRAWLED];
  return {
    rules: [
      // Card pictures (/api/og) stay fetchable so link previews work.
      { userAgent: "*", allow: ["/", "/api/og/"], disallow },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: ["/", "/api/og/"], disallow })),
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
