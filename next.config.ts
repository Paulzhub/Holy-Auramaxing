import { fileURLToPath } from "node:url";

import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { securityHeaders } from "./src/lib/security/headers";

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  experimental: {
    // Compile ICU messages at build time so the ICU parser never ships to browsers.
    messages: { format: "json", path: "./messages", locales: "infer", precompile: true },
  },
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Pin the project root, so a stray package-lock.json in a parent folder
  // (e.g. the user's home directory) is never mistaken for this project's.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  // Titles go in <head> of the first HTML for every visitor, not streamed into
  // <body> later: screen readers and tab titles get them at once (WCAG 2.4.2),
  // and our metadata is only translated strings, so nothing waits on it.
  htmlLimitedBots: /.*/,
  experimental: {
    // Profile photos can be up to 5 MB (CLAUDE.md §7.3), plus multipart overhead.
    // Everything else stays far below this; rate limits apply per action.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(process.env.NODE_ENV === "production"),
      },
      {
        // API responses are never search results (§12).
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // The service worker (push only for now, D-092; Phase 10 adds caching):
        // always fetched fresh, so an update reaches every device, and locked
        // down to its own origin.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

// Articles are MDX compiled at build time (D-116): nothing is evaluated at run
// time, so the strict CSP is unchanged. No remark or rehype plugins.
const withMDX = createMDX({});

export default withNextIntl(withMDX(nextConfig));
