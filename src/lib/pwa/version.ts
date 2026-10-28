/**
 * This build's version (D-125): set in next.config.ts at build time, the
 * commit on Vercel. The service worker is registered as /sw.js?v=<version>,
 * so every deploy installs a new worker, and /api/version tells an open page
 * that a newer one exists.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

const versionPattern = /^[A-Za-z0-9_-]{1,40}$/;

export function isVersion(value: unknown): value is string {
  return typeof value === "string" && versionPattern.test(value);
}

/** The worker's address for a version. Every page and the push settings use this, so they never fight. */
export function serviceWorkerUrl(version: string = APP_VERSION): string {
  return `/sw.js?v=${encodeURIComponent(isVersion(version) ? version : "dev")}`;
}
