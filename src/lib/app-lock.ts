/**
 * The app lock (CLAUDE.md §7.10, D-113): a privacy screen kept on this device
 * only. Shared by the boot script (before first paint), the lock screen and
 * its settings card (src/features/recovery), and the sign-out actions.
 *
 * What it is: a screen against someone who picks up an unlocked phone. What
 * it isn't: a security boundary. Someone holding the device with developer
 * tools can remove it; the account itself is still protected by sign-in.
 * Nothing about it ever leaves the device. See docs/threat-model.md.
 */

import { DB_NAME as PWA_DB_NAME, SW_MESSAGES } from "@/lib/pwa/constants";

/** localStorage: the lock's settings and PIN hash. */
export const LOCK_KEY = "ha-lock";
/** localStorage: when the app was last in front of someone (ms since 1970). */
export const SEEN_KEY = "ha-lock-seen";
/** localStorage: "1" while locked, so a reload (or another tab) stays locked. */
export const LOCKED_KEY = "ha-lock-on";
/** localStorage: wrong tries and the wait after them. */
export const FAILS_KEY = "ha-lock-fails";
/** A one-minute cookie set at sign-out; the boot script then forgets the lock on this device. */
export const CLEAR_COOKIE = "ha-lock-clear";

export const AUTO_LOCK_MINUTES = [0, 1, 5, 15] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_MINUTES)[number];
export const DEFAULT_AUTO_LOCK: AutoLockMinutes = 1;

export const PIN_LENGTH = 6;
export const PBKDF2_ITERATIONS = 310_000;
/** Free tries before a wait starts. */
export const FREE_TRIES = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 15 * 60_000;
/** "Immediately" still allows a reload or a quick glance at another tab. */
const IMMEDIATE_GRACE_MS = 5_000;

export interface LockRecord {
  v: 1;
  /** Which account set it (a hash, not the id), so another account on this device never meets it. */
  owner: string;
  after: AutoLockMinutes;
  pin: { salt: string; hash: string; iterations: number };
  /** A WebAuthn platform credential for fingerprint or face, if added. */
  credentialId: string | null;
}

export interface Fails {
  n: number;
  /** No tries before this time (ms). */
  until: number;
}

export function isLockRecord(value: unknown): value is LockRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<LockRecord>;
  return (
    r.v === 1 &&
    typeof r.owner === "string" &&
    (AUTO_LOCK_MINUTES as readonly number[]).includes(r.after as number) &&
    !!r.pin &&
    typeof r.pin.salt === "string" &&
    typeof r.pin.hash === "string" &&
    typeof r.pin.iterations === "number" &&
    (r.credentialId === null || typeof r.credentialId === "string")
  );
}

export function awayLimitMs(after: AutoLockMinutes): number {
  return after === 0 ? IMMEDIATE_GRACE_MS : after * 60_000;
}

/** Locked if it was locked, if nobody has seen the app on this device yet, or if it was away too long. */
export function shouldLock(record: LockRecord | null, seen: number, now: number, wasLocked: boolean): boolean {
  if (!record) return false;
  return wasLocked || !seen || now - seen >= awayLimitMs(record.after);
}

/** After a wrong PIN: five free tries, then 30 seconds, doubling each time, up to 15 minutes. */
export function afterWrongPin(fails: Fails, now: number): Fails {
  const n = fails.n + 1;
  if (n < FREE_TRIES) return { n, until: 0 };
  const wait = Math.min(FIRST_WAIT_MS * 2 ** (n - FREE_TRIES), MAX_WAIT_MS);
  return { n, until: now + wait };
}

export const pinPattern = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/**
 * Runs in <head> before first paint (like the theme's), so the lock is in
 * place before any content shows. After a sign-out it forgets the lock on
 * this device instead, and with it the offline queue, the device's note of
 * who is signed in, and the service worker's caches (D-126).
 */
export const appLockBootScript = `(function(){try{var d=document.documentElement,L=localStorage;if(/(?:^|; )${CLEAR_COOKIE}=1(?:;|$)/.test(document.cookie)){L.removeItem("${LOCK_KEY}");L.removeItem("${LOCKED_KEY}");L.removeItem("${FAILS_KEY}");L.removeItem("${SEEN_KEY}");document.cookie="${CLEAR_COOKIE}=; path=/; max-age=0";try{indexedDB.deleteDatabase("${PWA_DB_NAME}");var w=navigator.serviceWorker&&navigator.serviceWorker.controller;w&&w.postMessage("${SW_MESSAGES.forget}")}catch(e){}return}var r=JSON.parse(L.getItem("${LOCK_KEY}")||"null");if(!r||r.v!==1||!r.pin)return;var s=+(L.getItem("${SEEN_KEY}")||0),a=r.after===0?${IMMEDIATE_GRACE_MS}:r.after*60000;if(L.getItem("${LOCKED_KEY}")==="1"||!s||Date.now()-s>=a){L.setItem("${LOCKED_KEY}","1");d.setAttribute("data-locked","")}}catch(e){}})();`;
