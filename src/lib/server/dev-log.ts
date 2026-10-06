/**
 * Explains a failure in the terminal while developing (`npm run dev`), where
 * people otherwise only see a gentle "couldn't save" message. Silent in
 * production builds: errors there go to Sentry (Phase 12), with no user content.
 */
export function devLog(scope: string, error: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  const detail = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console -- development-only diagnostics
  console.warn(`[${scope}] ${detail}`);
}
