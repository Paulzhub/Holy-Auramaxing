import { expect, type BrowserContext, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 10: the installable app (CLAUDE.md §13; D-122 to D-127). The rules
// themselves are unit-tested (src/lib/pwa/pwa.test.ts) and in pgTAP 051/052.
// Here: the service worker, the offline page and queue in a real browser.

// WebGL in headless Chromium (story chunks must really load for the cache check).
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  },
});

const DB = "ha-pwa";

/** Reads one record from the device's store, the way the app opens it. */
async function deviceRecord(page: Page, store: "meta" | "queue", key?: string): Promise<unknown> {
  return page.evaluate(
    ([db, storeName, k]) =>
      new Promise((resolve) => {
        const request = indexedDB.open(db, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("queue", { keyPath: "id" });
          request.result.createObjectStore("meta");
        };
        request.onsuccess = () => {
          const conn = request.result;
          const tx = conn.transaction(storeName);
          const get = k ? tx.objectStore(storeName).get(k) : tx.objectStore(storeName).getAll();
          get.onsuccess = () => {
            conn.close();
            resolve(get.result ?? null);
          };
          get.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      }),
    [DB, store, key ?? ""] as const,
  );
}

/** Waits until the app has registered the worker and told this device who is signed in. */
async function deviceReady(page: Page, userId: string) {
  await expect
    .poll(async () => ((await deviceRecord(page, "meta", "session")) as { userId?: string } | null)?.userId, {
      timeout: 30_000,
    })
    .toBe(userId);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
  // The offline page is kept for this version.
  await expect
    .poll(
      () => page.evaluate(async () => Boolean(await caches.match("/offline"))),
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** A time zone where it's now between 13:00 and 22:59, so "yesterday" has closed (D-067). */
function afternoonZone(): string {
  const zones = [
    "Pacific/Kiritimati",
    "Pacific/Auckland",
    "Asia/Tokyo",
    "Asia/Kolkata",
    "Europe/Moscow",
    "Europe/London",
    "America/Sao_Paulo",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Pacific/Honolulu",
    "Pacific/Pago_Pago",
  ];
  for (const zone of zones) {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(new Date()),
    );
    if (hour >= 13 && hour <= 22) return zone;
  }
  throw new Error("no afternoon zone");
}

function dateIn(zone: string, offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

/** The instant it is 20:30 on `date` in `zone`. */
function eveningOf(date: string, zone: string): Date {
  const guess = new Date(`${date}T20:30:00Z`);
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const part = (t: string) => Number(local.find((p) => p.type === t)?.value);
  const shiftMinutes = (part("hour") - 20) * 60 + part("minute") - 30 + (part("day") - Number(date.slice(8))) * 1440;
  return new Date(guess.getTime() - shiftMinutes * 60_000);
}

async function goOffline(context: BrowserContext) {
  await context.setOffline(true);
}

test.describe("PWA (Phase 10)", () => {
  test.use({ storageState: signedOut });
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.skip(({ isMobile }) => isMobile, "Service-worker flows run once, on desktop");

  test("offline: a check-in made in airplane mode syncs exactly once when back online", async ({ page, context }) => {
    const me = await signInNewMember(page, "pwa-once");
    const zone = "Asia/Kolkata";
    await deviceReady(page, me.userId);

    await goOffline(context);
    await page.goto("/check-in");
    await expect(page.getByRole("heading", { level: 1, name: "You’re offline" })).toBeVisible();
    await expect(page).toHaveTitle(/^Offline \|/);
    const form = page.getByTestId("offline-checkin");
    await form.getByText("Add how it went (optional)").click();
    await form.getByRole("radio", { name: "Good" }).check();
    await form.getByRole("checkbox", { name: "Tired" }).check();
    await form.getByLabel("Private note").fill("Walked instead of scrolling.");
    await form.getByRole("button", { name: "I stayed free today" }).click();
    await expect(page.getByRole("heading", { name: "Kept on this device" })).toBeFocused();
    await expect(page.getByTestId("offline-waiting")).toHaveText("1 check-in is waiting to be sent.");

    // What waits on the device: the day, the moment, and a sealed note (never the words).
    const queued = (await deviceRecord(page, "queue")) as Array<Record<string, unknown>>;
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ userId: me.userId, localDate: dateIn(zone), outcome: "clean", mood: 4 });
    expect(String(queued[0]?.recordedAt)).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(String(queued[0]?.sealedNote)).toMatch(/^s1\./);
    expect(JSON.stringify(queued)).not.toContain("scrolling");
    await expectNoAxeViolations(page, "offline page, saved");

    // Back online: the worker is asked to send twice at once, and the same item is posted again by hand.
    await context.setOffline(false);
    const sends = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      r.active?.postMessage("ha-flush");
      r.active?.postMessage("ha-flush");
      return true;
    });
    expect(sends).toBe(true);
    await expect.poll(async () => ((await deviceRecord(page, "queue")) as unknown[]).length, { timeout: 15_000 }).toBe(0);
    const again = await page.request.post("/api/checkins/sync", {
      data: {
        forUser: me.userId,
        date: queued[0]?.localDate,
        recordedAt: queued[0]?.recordedAt,
        outcome: "clean",
        sealedNote: queued[0]?.sealedNote,
      },
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(again.status()).toBe(409);
    expect(await again.json()).toMatchObject({ error: "alreadyAnswered", drop: true });

    const { data: rows } = await admin()
      .from("checkins")
      .select("local_date, outcome, mood, triggers, note_encrypted")
      .eq("user_id", me.userId);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({ local_date: dateIn(zone), outcome: "clean", mood: 4, triggers: ["tired"] });
    // The note was opened by the server and stored encrypted like any note (D-123).
    expect(rows?.[0]?.note_encrypted).toMatch(/^v1:/);
    await page.goto(`/check-in`);
    await page.getByText("Change your answer").click();
    await expect(page.getByLabel("Private note")).toHaveValue("Walked instead of scrolling.");
  });

  test("a check-in made offline yesterday, synced today after 12:00, counts for yesterday and costs no levels", async ({
    page,
    context,
  }) => {
    const me = await signInNewMember(page, "pwa-late");
    const zone = afternoonZone();
    // 25 free days ending the day before yesterday: Level 5. Yesterday has no answer yet.
    const rows = [];
    for (let n = 26; n >= 2; n -= 1) {
      rows.push({ user_id: me.userId, local_date: dateIn(zone, -n), timezone: zone, outcome: "clean" });
    }
    await admin().from("checkins").insert(rows);
    await admin()
      .from("profiles")
      .update({ timezone: zone, created_at: new Date(Date.now() - 30 * 86_400_000).toISOString() })
      .eq("id", me.userId);
    await page.goto("/home");
    await deviceReady(page, me.userId);
    // Before the sync, yesterday counts as missed: 10 levels down (Level 0).
    await expect(page.getByText(/Level 0 ·/)).toBeVisible();

    // Yesterday evening, offline.
    const yesterday = dateIn(zone, -1);
    await page.clock.setFixedTime(eveningOf(yesterday, zone));
    await goOffline(context);
    await page.goto("/check-in");
    await expect(page.getByRole("heading", { level: 1, name: "You’re offline" })).toBeVisible();
    await page.getByRole("button", { name: "I stayed free today" }).click();
    await expect(page.getByRole("heading", { name: "Kept on this device" })).toBeVisible();
    const queued = (await deviceRecord(page, "queue")) as Array<{ localDate: string; recordedAt: string }>;
    expect(queued[0]?.localDate).toBe(yesterday);

    // Today, after 12:00: back online, the app opens and sends it.
    await page.clock.setFixedTime(new Date());
    await context.setOffline(false);
    await page.goto("/home");
    await expect(page.getByText(/Your check-in for .+ was saved\./)).toBeVisible({ timeout: 30_000 });
    const { data: day } = await admin()
      .from("checkins")
      .select("outcome")
      .eq("user_id", me.userId)
      .eq("local_date", yesterday)
      .single();
    expect(day?.outcome).toBe("clean");
    const { count } = await admin()
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", me.userId)
      .eq("action", "checkin.synced_late");
    expect(count).toBe(1);
    // 26 free days: still Level 5 (Breath of Life Ultra), one day into the next bar.
    await page.reload();
    await expect(page.getByText(/Level 5 ·/)).toBeVisible();
  });

  test("nothing personal or 3D is ever cached; sign-out forgets the device", async ({ page }) => {
    const me = await signInNewMember(page, "pwa-cache");
    await deviceReady(page, me.userId);
    // The landing page's 3D story loads on intent, through the worker now; it must not end up in a cache.
    const storyLoaded = page
      .waitForResponse(
        async (r) =>
          r.url().includes("/_next/static/chunks/") &&
          /THREE\.WebGLRenderer|lenis-smooth/.test(await r.text().catch(() => "")),
        { timeout: 20_000 },
      )
      .then(() => true);
    await page.goto("/");
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 600);
    expect(await storyLoaded).toBe(true);
    await page.waitForTimeout(1500);
    for (const path of ["/home", "/check-in", "/progress", "/journal", "/me"]) await page.goto(path);
    await page.waitForTimeout(1000);

    const cached = await page.evaluate(async () => {
      const out: { cache: string; url: string; story: boolean }[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          const text = response && /\.js$/.test(new URL(request.url).pathname) ? await response.text() : "";
          out.push({
            cache: name,
            url: new URL(request.url).pathname,
            story: /THREE\.WebGLRenderer|ScrollTrigger|lenis-smooth/.test(text),
          });
        }
      }
      return out;
    });
    expect(cached.length).toBeGreaterThan(0);
    const pages = cached.filter((c) => !c.url.startsWith("/_next/static/") && !c.url.startsWith("/icons/"));
    expect(pages.map((c) => c.url).sort()).toEqual(["/breathe", "/offline"]);
    expect(cached.filter((c) => c.story)).toEqual([]);
    expect(cached.every((c) => c.cache.startsWith("ha-"))).toBe(true);
    // The kept offline page holds nobody's data.
    const offlineHtml = await page.evaluate(async () => (await (await caches.match("/offline"))?.text()) ?? "");
    expect(offlineHtml).not.toContain(me.userId);
    expect(offlineHtml).not.toContain(me.email);

    // Sign out: the device's queue and record of who was here are gone.
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/\?notice=signed-out$/);
    await expect.poll(() => deviceRecord(page, "meta", "session"), { timeout: 10_000 }).toBeNull();
  });

  test('a new deploy shows "A new version is ready" instead of staying on old code', async ({ page }) => {
    const me = await signInNewMember(page, "pwa-update");
    await deviceReady(page, me.userId);
    await page.route("**/api/version", (route) =>
      route.fulfill({ json: { version: "newer1" }, headers: { "Cache-Control": "no-store" } }),
    );
    // Coming back to the app checks again.
    await page.goto("/groups");
    const banner = page.getByTestId("update-banner");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner.getByRole("heading", { name: "A new version is ready" })).toBeVisible();
    await expectNoAxeViolations(page, "update banner");
    // The new worker was fetched and waits for Refresh.
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.waiting?.scriptURL ?? ""))
      .toContain("v=newer1");
    const reloaded = page.waitForEvent("load");
    await banner.getByRole("button", { name: "Refresh" }).click();
    await reloaded;
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.scriptURL ?? ""))
      .toContain("v=newer1");
  });

  test("the install card comes after the first check-in, and 'Not now' keeps it away for 30 days", async ({ page }) => {
    await signInNewMember(page, "pwa-install");
    await page.goto("/check-in");
    await page.getByRole("button", { name: "I stayed free today" }).click();
    await expect(page).toHaveURL(/\/check-in\/done\?date=/);
    // Chrome offers installing with this event once the app qualifies.
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      };
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(event);
    });
    const card = page.getByTestId("install-card");
    await expect(card.getByRole("heading", { name: "Add the app to this device" })).toBeVisible();
    await expectNoAxeViolations(page, "install card");
    await card.getByRole("button", { name: "Not now" }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void> };
      event.prompt = async () => {};
      window.dispatchEvent(event);
    });
    await expect(page.getByTestId("install-card")).toHaveCount(0);
  });

  test("on an iPhone, Safari shows the Share, then Add to Home Screen steps before any push question", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      delete (window as { PushManager?: unknown }).PushManager;
    });
    await signInNewMember(page, "pwa-ios");
    await page.goto("/check-in");
    await page.getByRole("button", { name: "I stayed free today" }).click();
    const card = page.getByTestId("install-card");
    await expect(card.getByRole("heading", { name: "Add the app to your Home Screen" })).toBeVisible();
    // Push waits until the app is installed (§7.8: push on iPhone needs the installed app).
    await expect(page.getByTestId("push-explainer")).toHaveCount(0);
    await card.getByRole("button", { name: "Show me how" }).click();
    const sheet = page.getByRole("dialog", { name: "Add the app to your Home Screen" });
    await expect(sheet.getByTestId("ios-install-steps").getByRole("listitem")).toHaveCount(3);
    await expectNoAxeViolations(page, "iOS install sheet");
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(card.getByRole("button", { name: "Show me how" })).toBeFocused();
    await context.close();
  });

  test("the manifest: neutral names, shortcuts, screenshots, and every icon exists", async ({ request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m.name).toBe("Holy Auramaxing");
    expect(m.display).toBe("standalone");
    expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual(["/check-in", "/breathe"]);
    const purposes = m.icons.map((i: { purpose: string; sizes: string }) => `${i.purpose} ${i.sizes}`);
    for (const want of ["maskable 192x192", "maskable 512x512", "monochrome 192x192", "monochrome 512x512"]) {
      expect(purposes).toContain(want);
    }
    for (const asset of [...m.icons, ...m.screenshots]) {
      const res = await request.get(asset.src);
      expect(res.status(), asset.src).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
    }
    expect((await request.get("/favicon.ico")).status()).toBe(200);
  });

  test("an invite's QR code can be saved as a picture", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "pwa-qr"));
    const groupId = await createGroupAs(owner, "Morning walkers");
    await page.goto(`/groups/${groupId}/invites`);
    await page.getByRole("button", { name: "Make an invite" }).click();
    const panel = page.getByRole("region", { name: "Your invite is ready" });
    const png = panel.getByRole("link", { name: "Save QR code as an image" });
    await expect(png).toHaveAttribute("download", "invite-qr.png");
    await expect(png).toHaveAttribute("href", /^data:image\/png;base64,/);
    await expect(panel.getByRole("link", { name: "Download QR code" })).toHaveAttribute("download", "invite-qr.svg");
  });
});
