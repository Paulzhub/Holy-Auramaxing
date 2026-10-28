/**
 * Shared names for the installable app (CLAUDE.md §13; D-124 to D-127). The
 * service worker (public/sw.js, public/sw-queue.js) is plain JavaScript and
 * repeats these values; src/lib/pwa/pwa.test.ts checks they still match.
 */

/** IndexedDB database on the device: the offline queue and what the offline page needs. */
export const DB_NAME = "ha-pwa";
export const DB_VERSION = 1;
/** Check-ins waiting to be sent, keyed by id. */
export const QUEUE_STORE = "queue";
/** Small records: "session" (who is signed in here) and "noteKey" (the server's public key). */
export const META_STORE = "meta";

/** Background Sync tag for the queue. */
export const SYNC_TAG = "ha-checkins";

/** The server's limit (offline_sync_max_days, D-067): older items are forgotten on the device too. */
export const QUEUE_MAX_AGE_DAYS = 7;

/** Messages between the pages and the worker. */
export const SW_MESSAGES = {
  /** page → worker: send the queue now. */
  flush: "ha-flush",
  /** page → worker: the new version may take over now. */
  skipWaiting: "ha-skip-waiting",
  /** page → worker: forget everything on this device (sign-out). */
  forget: "ha-forget",
  /** page → worker: refresh the offline pages (kept from D-106). */
  refreshOffline: "refresh-offline",
  /** worker → pages: what happened to queued check-ins. */
  synced: "ha-synced",
} as const;

/** Where a failed page load goes (no account needed; nobody's data on it). */
export const OFFLINE_PAGE = "/offline";
export const BREATHE_PAGE = "/breathe";
