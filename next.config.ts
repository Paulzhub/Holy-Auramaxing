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

// This build's version (D-125): the commit on Vercel, otherwise a new value
// for every build. The service worker is registered as /sw.js?v=<version>, so
// every deploy installs a new worker and the app can offer "Refresh".
const appVersion = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || `b${Date.now().toString(36)}`;

// On a Vercel preview with no site address set, the branch's own stable
// address (<project>-git-<branch>-<team>.vercel.app), so links in emails and
// sign-in redirects point at the preview (D-128, docs/hosting-preview.md).
const previewSiteUrl =
  !process.env.NEXT_PUBLIC_SITE_URL && process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL
    ? `https://${process.env.VERCEL_BRANCH_URL}`
    : undefined;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || appVersion,
    ...(previewSiteUrl ? { NEXT_PUBLIC_SITE_URL: previewSiteUrl } : {}),
  },
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
        // The service worker and its queue sender (D-092, D-124): always
        // fetched fresh, so an update reaches every device, and locked down
        // to their own origin.
        source: "/:file(sw\\.js|sw-queue\\.js)",
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
