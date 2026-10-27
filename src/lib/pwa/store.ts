import type { NoteKey } from "@/lib/offline/sealed-note";

import { DB_NAME, DB_VERSION, META_STORE, QUEUE_STORE } from "./constants";
import { isExpired, type DeviceSession, type QueuedCheckin } from "./queue";

/**
 * The device's own store for the installable app (D-126): IndexedDB, because
 * the service worker can read it too (localStorage isn't available there).
 * Every call is wrapped: storage can be missing or refuse (private windows),
 * and then the offline queue is simply unavailable.
 *
 * It holds: check-ins waiting to be sent (never a plain-text note), who is
 * signed in here and their time zone, and the server's public note key.
 * Sign-out clears it all (forgetDevice).
 */

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no-indexeddb"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb-open"));
    request.onblocked = () => reject(new Error("indexeddb-blocked"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb-tx"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb-abort"));
  });
}

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb-read"));
  });
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>, fallback: T): Promise<T> {
  let db: IDBDatabase | null = null;
  try {
    db = await open();
    return await fn(db);
  } catch {
    return fallback;
  } finally {
    db?.close();
  }
}

export function getSession(): Promise<DeviceSession | null> {
  return withDb(async (db) => {
    const value = await read(db.transaction(META_STORE).objectStore(META_STORE).get("session"));
    return (value as DeviceSession | undefined) ?? null;
  }, null);
}

export function getNoteKey(): Promise<NoteKey | null> {
  return withDb(async (db) => {
    const value = await read(db.transaction(META_STORE).objectStore(META_STORE).get("noteKey"));
    return (value as NoteKey | undefined) ?? null;
  }, null);
}

/** Written by the app while online. A different person signing in replaces the last one. */
export function saveSession(session: DeviceSession, noteKey: NoteKey | null): Promise<boolean> {
  return withDb(async (db) => {
    const tx = db.transaction(META_STORE, "readwrite");
    const store = tx.objectStore(META_STORE);
    store.put(session, "session");
    if (noteKey) store.put(noteKey, "noteKey");
    else store.delete("noteKey");
    await done(tx);
    return true;
  }, false);
}

/** Every queued check-in (any person), oldest first; expired ones are removed. */
export function listQueue(now: Date = new Date()): Promise<QueuedCheckin[]> {
  return withDb(async (db) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const all = (await read(store.getAll())) as QueuedCheckin[];
    const keep: QueuedCheckin[] = [];
    for (const item of all) {
      if (isExpired(item, now)) store.delete(item.id);
      else keep.push(item);
    }
    await done(tx);
    return keep.sort((a, b) => a.id.localeCompare(b.id));
  }, []);
}

/** How many check-ins this person has waiting (never what they say). */
export async function countWaiting(userId: string): Promise<number> {
  return (await listQueue()).filter((q) => q.userId === userId).length;
}

/** Adds a check-in; one for the same person and day replaces the earlier one. */
export function enqueue(item: QueuedCheckin): Promise<boolean> {
  return withDb(async (db) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const all = (await read(store.getAll())) as QueuedCheckin[];
    for (const q of all) if (q.userId === item.userId && q.localDate === item.localDate) store.delete(q.id);
    store.put(item);
    await done(tx);
    return true;
  }, false);
}

/** Sign-out on this device: the queue, the session and the key are all forgotten. */
export function forgetDevice(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(true);
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
