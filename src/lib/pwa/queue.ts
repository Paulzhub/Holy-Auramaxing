import type { NoteKey } from "@/lib/offline/sealed-note";

import { QUEUE_MAX_AGE_DAYS } from "./constants";

/**
 * The offline check-in queue's rules (CLAUDE.md §7.5, §13; D-126). Pure, so
 * they can be tested; the store is in store.ts and the sender is the service
 * worker (public/sw-queue.js), which follows the same rules.
 */

export type Outcome = "clean" | "slipped";

/** One check-in made on this device and not sent yet. */
export interface QueuedCheckin {
  /** UUIDv7-ish id made on the device (only for the queue itself). */
  id: string;
  /** Who made it: it is only ever sent with that person's session. */
  userId: string;
  /** The day it is for, in the person's time zone (YYYY-MM-DD). */
  localDate: string;
  /** When it was made, by the device's clock (ISO with offset). */
  recordedAt: string;
  outcome: Outcome;
  mood: number | null;
  urge: number | null;
  triggers: string[];
  /** The private note, sealed so only the server can open it (D-123). Never plain text. */
  sealedNote: string | null;
}

/** Who is signed in on this device, written by the app while online. */
export interface DeviceSession {
  userId: string;
  timeZone: string;
  /** The app lock's owner hash (D-113), so the offline page can apply the lock. */
  lockOwner: string;
  /** When this was last confirmed online (ms). */
  at: number;
}

export interface DeviceMeta {
  session: DeviceSession | null;
  noteKey: NoteKey | null;
}

/** YYYY-MM-DD for an instant in a time zone. */
export function localDate(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localHour(timeZone: string, at: Date): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at);
  return Number(hour);
}

function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The days that can be answered now: today, plus yesterday until 12:00 local (util.checkin_dates). */
export function openDays(timeZone: string, at: Date): string[] {
  const today = localDate(timeZone, at);
  return localHour(timeZone, at) < 12 ? [today, previousDay(today)] : [today];
}

/** An ISO time with the device's own offset, e.g. 2026-10-27T20:30:00.000+05:30. */
export function isoWithOffset(at: Date): string {
  const offset = -at.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const local = new Date(at.getTime() + offset * 60_000).toISOString().slice(0, 23);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Adds an item; a second answer for the same person and day replaces the first, as online. */
export function upsert(queue: readonly QueuedCheckin[], item: QueuedCheckin): QueuedCheckin[] {
  return [...queue.filter((q) => !(q.userId === item.userId && q.localDate === item.localDate)), item];
}

/** Older than the server would accept: forget it on the device too. */
export function isExpired(item: QueuedCheckin, now: Date): boolean {
  const made = Date.parse(item.recordedAt);
  return !Number.isFinite(made) || now.getTime() - made > QUEUE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/** What to do with an item after the server answered (D-067): forget it, or keep it for later. */
export type ReplyAction = "sent" | "drop" | "keep";

export function replyAction(httpStatus: number, body: unknown): ReplyAction {
  const b = (body && typeof body === "object" ? body : {}) as { status?: unknown; drop?: unknown };
  if (httpStatus >= 200 && httpStatus < 300 && typeof b.status === "string") return "sent";
  if (b.drop === true) return "drop";
  return "keep";
}

/** The JSON the sync route expects. */
export function syncPayload(item: QueuedCheckin) {
  return {
    forUser: item.userId,
    date: item.localDate,
    recordedAt: item.recordedAt,
    outcome: item.outcome,
    mood: item.mood,
    urge: item.urge,
    triggers: item.triggers,
    sealedNote: item.sealedNote,
  };
}

/** A random id that sorts by time (UUIDv7 layout). */
export function queueId(now: Date = new Date()): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let ms = now.getTime();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms & 0xff;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
