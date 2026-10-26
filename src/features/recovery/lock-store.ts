/**
 * The app lock's state on this device (D-113): localStorage, read and written
 * only here, with a small event so every part of the page (and other tabs,
 * through the storage event) hears about a change. Every access is wrapped:
 * storage can be missing or refuse (private windows), and then there is
 * simply no lock.
 */
import {
  FAILS_KEY,
  isLockRecord,
  LOCK_KEY,
  LOCKED_KEY,
  SEEN_KEY,
  shouldLock,
  type Fails,
  type LockRecord,
} from "@/lib/app-lock";

const EVENT = "ha-lock-change";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function put(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // No storage, no lock.
  }
}

function changed(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeLock(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

let cachedRaw: string | null = null;
let cachedRecord: LockRecord | null = null;

/** The lock's settings (the same object until they change, for useSyncExternalStore). */
export function readRecord(): LockRecord | null {
  const raw = get(LOCK_KEY);
  if (raw === cachedRaw) return cachedRecord;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cachedRecord = isLockRecord(parsed) ? parsed : null;
  } catch {
    cachedRecord = null;
  }
  return cachedRecord;
}

export function writeRecord(record: LockRecord): void {
  put(LOCK_KEY, JSON.stringify(record));
  markSeen();
  changed();
}

/**
 * Turns the lock off on this device and forgets everything about it. While
 * signing out ("Forgot PIN?"), the screen stays covered until the next page.
 */
export function forgetLock({ keepCovered = false }: { keepCovered?: boolean } = {}): void {
  for (const key of [LOCK_KEY, LOCKED_KEY, FAILS_KEY, SEEN_KEY]) put(key, null);
  if (!keepCovered) document.documentElement.removeAttribute("data-locked");
  changed();
}

export function isLocked(): boolean {
  return document.documentElement.hasAttribute("data-locked");
}

export function markSeen(now = Date.now()): void {
  put(SEEN_KEY, String(now));
}

export function lockNow(): void {
  if (!readRecord()) return;
  put(LOCKED_KEY, "1");
  document.documentElement.setAttribute("data-locked", "");
  changed();
}

export function unlock(): void {
  put(LOCKED_KEY, null);
  put(FAILS_KEY, null);
  markSeen();
  document.documentElement.removeAttribute("data-locked");
  changed();
}

/** Locks if the auto-lock time has passed since the app was last in front of someone. */
export function lockIfDue(now = Date.now()): void {
  const record = readRecord();
  const seen = Number(get(SEEN_KEY) ?? 0);
  if (shouldLock(record, seen, now, get(LOCKED_KEY) === "1")) lockNow();
  else if (!record && isLocked()) unlock();
}

/** Another tab locked or unlocked: follow it. */
export function followOtherTabs(): void {
  const locked = get(LOCKED_KEY) === "1" && !!readRecord();
  if (locked !== isLocked()) {
    if (locked) document.documentElement.setAttribute("data-locked", "");
    else document.documentElement.removeAttribute("data-locked");
    changed();
  }
}

export function readFails(): Fails {
  try {
    const parsed = JSON.parse(get(FAILS_KEY) ?? "null") as Partial<Fails> | null;
    return { n: Number(parsed?.n ?? 0) || 0, until: Number(parsed?.until ?? 0) || 0 };
  } catch {
    return { n: 0, until: 0 };
  }
}

export function writeFails(fails: Fails): void {
  put(FAILS_KEY, JSON.stringify(fails));
}
