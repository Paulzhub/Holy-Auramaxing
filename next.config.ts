import { fileURLToPath } from "node:url";

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
    ];
  },
};

export default withNextIntl(nextConfig);
