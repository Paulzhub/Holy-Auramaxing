import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import {
  afterWrongPin,
  appLockBootScript,
  awayLimitMs,
  CLEAR_COOKIE,
  isLockRecord,
  LOCK_KEY,
  LOCKED_KEY,
  SEEN_KEY,
  shouldLock,
  type LockRecord,
} from "../../lib/app-lock";
import { isDiscreet } from "../../lib/discretion";
import { checkPin, hashPin } from "./lock-crypto";
import { forgetLock, lockIfDue, readRecord, unlock } from "./lock-store";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const record = (over: Partial<LockRecord> = {}): LockRecord => ({
  v: 1,
  owner: "abc",
  after: 1,
  pin: { salt: "c2FsdA==", hash: "aGFzaA==", iterations: 1000 },
  credentialId: null,
  ...over,
});

describe("the app lock's rules (§7.10, D-113)", () => {
  it("locks after the chosen time away, and stays locked once locked", () => {
    const now = 1_000_000_000;
    expect(shouldLock(null, now - 1e9, now, true)).toBe(false);
    expect(shouldLock(record({ after: 1 }), now - 59_000, now, false)).toBe(false);
    expect(shouldLock(record({ after: 1 }), now - 60_000, now, false)).toBe(true);
    expect(shouldLock(record({ after: 15 }), now - 14 * 60_000, now, false)).toBe(false);
    expect(shouldLock(record({ after: 1 }), now, now, true)).toBe(true);
    expect(shouldLock(record(), 0, now, false)).toBe(true);
  });

  it("'any time I leave' still allows a reload or a glance at another tab", () => {
    expect(awayLimitMs(0)).toBe(5_000);
    expect(awayLimitMs(5)).toBe(300_000);
  });

  it("gives five free tries, then a wait that doubles up to 15 minutes", () => {
    let fails = { n: 0, until: 0 };
    for (let i = 0; i < 4; i++) {
      fails = afterWrongPin(fails, 0);
      expect(fails.until).toBe(0);
    }
    fails = afterWrongPin(fails, 0);
    expect(fails.until).toBe(30_000);
    fails = afterWrongPin(fails, 0);
    expect(fails.until).toBe(60_000);
    for (let i = 0; i < 10; i++) fails = afterWrongPin(fails, 0);
    expect(fails.until).toBe(15 * 60_000);
  });

  it("accepts only a well-formed record", () => {
    expect(isLockRecord(record())).toBe(true);
    expect(isLockRecord(record({ after: 2 as 1 }))).toBe(false);
    expect(isLockRecord({ ...record(), pin: null })).toBe(false);
    expect(isLockRecord("x")).toBe(false);
  });
});

describe("the PIN hash", () => {
  it("checks the right PIN and refuses a wrong one, with a fresh salt each time", async () => {
    const a = await hashPin("123456", 1000);
    const b = await hashPin("123456", 1000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toContain("123456");
    expect(await checkPin("123456", a)).toBe(true);
    expect(await checkPin("123457", a)).toBe(false);
    expect(await checkPin("", a)).toBe(false);
  });

  it("uses PBKDF2 with at least 310,000 rounds by default", () => {
    expect(read("src/lib/app-lock.ts")).toMatch(/PBKDF2_ITERATIONS = 310_000/);
  });
});

describe("before first paint (the boot script)", () => {
  const boot = () => new Function(appLockBootScript)() as void;
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-locked");
  });
  afterEach(() => {
    document.cookie = `${CLEAR_COOKIE}=; path=/; max-age=0`;
  });

  it("does nothing without a lock", () => {
    boot();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(false);
  });

  it("covers the page when the time away has passed", () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify(record({ after: 1 })));
    localStorage.setItem(SEEN_KEY, String(Date.now() - 61_000));
    boot();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(true);
    expect(localStorage.getItem(LOCKED_KEY)).toBe("1");
  });

  it("leaves the page alone within the time", () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify(record({ after: 5 })));
    localStorage.setItem(SEEN_KEY, String(Date.now() - 60_000));
    boot();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(false);
  });

  it("stays locked across a reload", () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify(record({ after: 15 })));
    localStorage.setItem(SEEN_KEY, String(Date.now()));
    localStorage.setItem(LOCKED_KEY, "1");
    boot();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(true);
  });

  it("forgets the lock after a sign-out on this device", () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify(record()));
    localStorage.setItem(LOCKED_KEY, "1");
    document.cookie = `${CLEAR_COOKIE}=1; path=/`;
    boot();
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(false);
    expect(document.cookie).not.toContain(`${CLEAR_COOKIE}=1`);
  });
});

describe("the lock on this device", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-locked");
  });

  it("locks when due and opens again, and a forgotten lock never locks", () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify(record({ after: 1 })));
    localStorage.setItem(SEEN_KEY, String(Date.now() - 120_000));
    expect(readRecord()?.owner).toBe("abc");
    lockIfDue();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(true);
    unlock();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(false);
    lockIfDue();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(false);
    forgetLock();
    expect(readRecord()).toBeNull();
    localStorage.setItem(SEEN_KEY, "1");
    lockIfDue();
    expect(document.documentElement.hasAttribute("data-locked")).toBe(false);
  });

  it("keeps the screen covered while signing out from the lock screen", () => {
    document.documentElement.setAttribute("data-locked", "");
    forgetLock({ keepCovered: true });
    expect(document.documentElement.hasAttribute("data-locked")).toBe(true);
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
  });
});

describe("the lock screen shows nothing but the app's name", () => {
  it("uses only the app's name and the lock's own words", () => {
    const code = read("src/features/recovery/components/app-lock.tsx");
    expect([...code.matchAll(/useTranslations\("([^"]+)"\)/g)].map((m) => m[1])).toEqual(["lock", "app"]);
    expect([...code.matchAll(/tApp\("([^"]+)"\)/g)].map((m) => m[1])).toEqual(["tabName"]);
    // No avatar, name, page title or anything the person wrote.
    expect(code).not.toMatch(/avatar|displayName|profile|document\.title/i);
  });

  it("and every word on it, and in its settings, is discreet", () => {
    const words = [...Object.values(en.lock), ...JSON.stringify(en.security.appLock).split('"')];
    expect(words.filter((w) => !isDiscreet(w))).toEqual([]);
  });

  it("stores no account id on the device (only a hash of it)", () => {
    const owner = read("src/features/recovery/server/lock.ts");
    expect(owner).toMatch(/createHash\("sha256"\)/);
    expect(read("src/lib/app-lock.ts")).not.toMatch(/userId/);
  });
});
