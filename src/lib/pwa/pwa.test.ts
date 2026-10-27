import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { DB_NAME, DB_VERSION, META_STORE, QUEUE_MAX_AGE_DAYS, QUEUE_STORE, SW_MESSAGES, SYNC_TAG } from "./constants";
import {
  isExpired,
  isoWithOffset,
  localDate,
  openDays,
  queueId,
  replyAction,
  syncPayload,
  upsert,
  type QueuedCheckin,
} from "./queue";
import { isVersion, serviceWorkerUrl } from "./version";

const root = process.cwd();
const sw = readFileSync(join(root, "public/sw.js"), "utf8");
const swQueueSource = readFileSync(join(root, "public/sw-queue.js"), "utf8");

interface SwQueue {
  DB_NAME: string;
  DB_VERSION: number;
  QUEUE_STORE: string;
  META_STORE: string;
  QUEUE_MAX_AGE_DAYS: number;
  replyAction: (status: number, body: unknown) => string;
  isExpired: (item: unknown, now: number) => boolean;
  payload: (item: QueuedCheckin) => unknown;
}
let swQueue: SwQueue;

beforeAll(() => {
  const holder: { haQueue?: SwQueue } = {};
  new Function("self", swQueueSource)(holder);
  swQueue = holder.haQueue as SwQueue;
});

const item = (over: Partial<QueuedCheckin> = {}): QueuedCheckin => ({
  id: "0192f000-0000-7000-8000-000000000001",
  userId: "00000000-0000-7000-8000-000000000001",
  localDate: "2026-10-26",
  recordedAt: "2026-10-26T20:30:00.000+05:30",
  outcome: "clean",
  mood: 4,
  urge: 1,
  triggers: ["tired"],
  sealedNote: null,
  ...over,
});

describe("the service worker and the app agree (D-124 to D-126)", () => {
  it("uses the same database, stores and limits", () => {
    expect(swQueue.DB_NAME).toBe(DB_NAME);
    expect(swQueue.DB_VERSION).toBe(DB_VERSION);
    expect(swQueue.QUEUE_STORE).toBe(QUEUE_STORE);
    expect(swQueue.META_STORE).toBe(META_STORE);
    expect(swQueue.QUEUE_MAX_AGE_DAYS).toBe(QUEUE_MAX_AGE_DAYS);
    expect(sw).toContain(`var SYNC_TAG = "${SYNC_TAG}";`);
    for (const [key, value] of Object.entries(SW_MESSAGES)) expect(sw, key).toContain(`${key}: "${value}"`);
  });

  it("handles server answers the same way", () => {
    const cases: [number, unknown][] = [
      [200, { status: "synced_late", noteLost: false }],
      [200, { status: "created" }],
      [409, { error: "alreadyAnswered", drop: true }],
      [400, { error: "invalid", drop: true }],
      [409, { error: "otherAccount", drop: false }],
      [401, { error: "signedOut", drop: false }],
      [429, { error: "rateLimited", drop: false }],
      [500, null],
      [200, null],
    ];
    for (const [status, body] of cases) expect(swQueue.replyAction(status, body)).toBe(replyAction(status, body));
    expect(replyAction(200, { status: "synced_late" })).toBe("sent");
    expect(replyAction(409, { drop: true })).toBe("drop");
    expect(replyAction(409, { drop: false })).toBe("keep");
    expect(replyAction(503, null)).toBe("keep");
  });

  it("sends the same payload: the day, the moment it was made, and who made it; never a plain note", () => {
    const i = item({ sealedNote: "s1.x" });
    expect(swQueue.payload(i)).toEqual(syncPayload(i));
    expect(syncPayload(i)).toEqual({
      forUser: i.userId,
      date: "2026-10-26",
      recordedAt: "2026-10-26T20:30:00.000+05:30",
      outcome: "clean",
      mood: 4,
      urge: 1,
      triggers: ["tired"],
      sealedNote: "s1.x",
    });
    expect(Object.keys(syncPayload(i))).not.toContain("note");
  });

  it("forgets items older than the server's 7 days, on both sides", () => {
    const now = new Date("2026-11-02T15:00:00.000Z");
    const fresh = item({ recordedAt: "2026-10-27T15:00:00.000Z" });
    const stale = item({ recordedAt: "2026-10-26T14:59:00.000Z" });
    expect(isExpired(fresh, now)).toBe(false);
    expect(isExpired(stale, now)).toBe(true);
    expect(isExpired(item({ recordedAt: "not a date" }), now)).toBe(true);
    for (const i of [fresh, stale]) expect(swQueue.isExpired(i, now.getTime())).toBe(isExpired(i, now));
  });
});

describe("the offline queue's rules (D-126)", () => {
  it("open days follow util.checkin_dates: today, plus yesterday until 12:00 local", () => {
    // 11:59 in Kolkata is 06:29 UTC.
    expect(openDays("Asia/Kolkata", new Date("2026-10-27T06:29:00Z"))).toEqual(["2026-10-27", "2026-10-26"]);
    expect(openDays("Asia/Kolkata", new Date("2026-10-27T06:30:00Z"))).toEqual(["2026-10-27"]);
    // Just after midnight in New York, across a month end.
    expect(openDays("America/New_York", new Date("2026-11-01T04:30:00Z"))).toEqual(["2026-11-01", "2026-10-31"]);
    expect(localDate("Pacific/Kiritimati", new Date("2026-10-27T11:00:00Z"))).toBe("2026-10-28");
  });

  it("a second answer for the same day replaces the first; other days and people stay", () => {
    const a = item({ id: "a", outcome: "clean" });
    const b = item({ id: "b", outcome: "slipped" });
    const other = item({ id: "c", localDate: "2026-10-25" });
    const someoneElse = item({ id: "d", userId: "00000000-0000-7000-8000-000000000002" });
    const q = upsert(upsert(upsert([a, other, someoneElse], b), other), b);
    expect(q.map((x) => x.id).sort()).toEqual(["b", "c", "d"]);
  });

  it("records the moment with the device's offset, which the server parses", () => {
    const s = isoWithOffset(new Date("2026-10-27T15:00:00.000Z"));
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(Date.parse(s)).toBe(Date.parse("2026-10-27T15:00:00.000Z"));
  });

  it("queue ids sort by time and look like UUIDv7", () => {
    const first = queueId(new Date("2026-10-27T10:00:00Z"));
    const second = queueId(new Date("2026-10-27T10:00:01Z"));
    expect(first < second).toBe(true);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("versions and the worker's address (D-125)", () => {
  it("every build has its own worker address; nothing odd gets in", () => {
    expect(serviceWorkerUrl("abc123")).toBe("/sw.js?v=abc123");
    expect(serviceWorkerUrl("../evil")).toBe("/sw.js?v=dev");
    expect(isVersion("b1x2y3")).toBe(true);
    expect(isVersion("a b")).toBe(false);
    expect(isVersion(42)).toBe(false);
  });
});

describe("the service worker's caching rules (D-124)", () => {
  it("answers a page load from the network, and only an offline page when that fails", () => {
    expect(sw).toMatch(/request\.mode === "navigate"[\s\S]{0,200}fetch\(request\)\.catch\(/);
    // No page's HTML is ever put in a cache, apart from the two offline pages fetched without cookies.
    expect(sw).toMatch(/var SHELL_PAGES = \[OFFLINE_PAGE, BREATHE_PAGE\];/);
    expect(sw).toMatch(/fetch\(page, \{ credentials: "omit", cache: "no-store" \}\)/);
    expect(sw.match(/cache\.put\(page,/g)).toHaveLength(1);
  });

  it("never keeps the landing page's 3D story", () => {
    expect(sw).toContain('var STORY_MARKERS = ["THREE.WebGLRenderer", "ScrollTrigger", "lenis-smooth"];');
    expect(sw).toMatch(/isStory\(await response\.clone\(\)\.text\(\)\)\) return response;/);
    const isStory = new Function(
      `${sw.slice(sw.indexOf("var STORY_MARKERS"), sw.indexOf("// ---------------------------------------------------------------- the offline pages"))}; return isStory;`,
    )() as (t: string) => boolean;
    expect(isStory("x=new THREE.WebGLRenderer(")).toBe(true);
    expect(isStory("class lenis-smooth")).toBe(true);
    expect(isStory("function Home(){}")).toBe(false);
  });

  it("touches only static files and icons otherwise: never /api, data or pictures", () => {
    expect(sw).toMatch(/url\.pathname\.indexOf\("\/_next\/static\/"\) === 0/);
    expect(sw).toMatch(/url\.pathname\.indexOf\("\/icons\/"\) === 0 \|\| url\.pathname === "\/manifest\.webmanifest"/);
    expect(sw).toMatch(/if \(request\.method !== "GET"\) return;/);
    expect(sw).toMatch(/if \(url\.origin !== self\.location\.origin\) return;/);
    expect(sw).not.toMatch(/\/api\/[a-z]+"[^;]*cache\.put/);
  });

  it("a new version waits for Refresh, except the very first worker", () => {
    expect(sw).toMatch(/if \(!self\.registration\.active\) return self\.skipWaiting\(\);/);
    expect(sw).toMatch(/if \(data === MSG\.skipWaiting\) self\.skipWaiting\(\);/);
    expect(sw.match(/skipWaiting\(\)/g)).toHaveLength(2);
  });

  it("sign-out forgets the caches and the queue", () => {
    expect(sw).toMatch(/async function forgetEverything\(\)/);
    expect(sw).toMatch(/indexedDB\.deleteDatabase\(self\.haQueue\.DB_NAME\)/);
  });
});
