import type { Page } from "@playwright/test";

import { appRoutes, expect, expectNoAxeViolations, signedOut, test } from "./fixtures";

/**
 * The scroll story "From chains to freedom" (Phase 9b, CLAUDE.md §8, D-121):
 * the static story paints first, the 3D loads only after the largest paint
 * and the visitor's first intent, every fallback keeps it out, and the app
 * never loads three.js.
 *
 * Headless Chromium has no GPU, so the 3D tests ask for SwiftShader's
 * software WebGL.
 */

const webgl = {
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  },
};

// Every test in this file runs with software WebGL (launch options apply per file).
test.use(webgl);

/** three.js keeps this string in its minified build (its warnings name the renderer). */
const THREE_MARKER = "THREE.WebGLRenderer";

const story = (page: Page) => page.locator("[data-story]");

async function storyState(page: Page): Promise<string | undefined> {
  return story(page).evaluate((el) => (el as HTMLElement).dataset.storyReady);
}

/** Records every largest-contentful-paint candidate from the very start. */
async function recordLcp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: Array<{ time: number; inHero: boolean }> };
    w.__lcp = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { element?: Element | null }>) {
        w.__lcp.push({
          time: entry.startTime,
          inHero: Boolean(entry.element?.closest('[data-scene="hero"]')),
        });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
}

/** The scripts the page loaded that contain three.js, with when each request started. */
async function threeRequests(page: Page): Promise<number[]> {
  const scripts = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((e) => e.name.endsWith(".js"))
      .map((e) => ({ url: e.name, start: e.startTime })),
  );
  const starts: number[] = [];
  for (const script of scripts) {
    const body = await (await page.request.get(script.url)).text();
    if (body.includes(THREE_MARKER)) starts.push(script.start);
  }
  return starts;
}

test.describe("with WebGL", () => {
  test.use({ storageState: signedOut });

  test("the largest paint is the hero's server HTML and comes before the first three.js request", async ({ page }) => {
    await recordLcp(page);
    await page.goto("/");
    await expect.poll(() => storyState(page)).toBe("waiting");

    // Nothing 3D has loaded while the visitor only reads the first screen.
    await page.waitForTimeout(1500);
    expect(await threeRequests(page)).toEqual([]);
    await expect(page.locator(".story-canvas")).toHaveCount(0);

    await page.mouse.wheel(0, 300);
    await expect.poll(() => storyState(page), { timeout: 30_000 }).toBe("3d");
    await expect(page.locator(".story-canvas")).toHaveCount(1);
    await expect(page.locator(".story-canvas")).toHaveAttribute("aria-hidden", "true");

    const lcp = await page.evaluate(
      () => (window as unknown as { __lcp: Array<{ time: number; inHero: boolean }> }).__lcp,
    );
    expect(lcp.length).toBeGreaterThan(0);
    const largest = lcp[lcp.length - 1]!;
    expect(largest.inHero).toBe(true);
    const three = await threeRequests(page);
    expect(three.length).toBeGreaterThan(0);
    expect(Math.min(...three)).toBeGreaterThan(largest.time);
  });

  test("the 3D story changes no words and stays readable to screen readers", async ({ page }) => {
    await page.goto("/");
    const before = (await story(page).textContent())!.replace(/\s+/g, " ").trim();
    await expect.poll(() => storyState(page)).toBe("waiting");
    await page.mouse.wheel(0, 300);
    await expect.poll(() => storyState(page), { timeout: 30_000 }).toBe("3d");

    const after = (await story(page).textContent())!.replace(/\s+/g, " ").trim();
    expect(after).toBe(before);
    await expect(page.getByRole("heading", { level: 1, name: "Freedom grows one day at a time" })).toBeAttached();
    for (const name of [
      "Many of us carry something we’ve never told anyone.",
      "You are not your worst day.",
      "One honest answer a day",
      "Together, not alone",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeAttached();
    }
    await expectNoAxeViolations(page, "/ with the 3D story");
    // Every scene stays in the page: hidden by opacity only, never display or visibility.
    for (const scene of await page.locator(".story-scene").all()) {
      await expect(scene).toHaveCSS("display", "grid");
      await expect(scene).toHaveCSS("visibility", "visible");
    }
  });

  test("scrolling through pins scenes 2 to 5, then dawn and the page carry on", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => storyState(page)).toBe("waiting");
    await page.mouse.wheel(0, 100);
    await expect.poll(() => storyState(page), { timeout: 30_000 }).toBe("3d");
    await expect(page.locator(".pin-spacer")).toHaveCount(1);

    const viewport = page.viewportSize()!;
    const crack = page.getByRole("heading", { level: 2, name: "You are not your worst day." });
    const pinTop = await page.locator(".pin-spacer").evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), pinTop + viewport.height * 0.9);
    await expect
      .poll(async () => crack.evaluate((el) => Number(getComputedStyle(el.closest("section")!).opacity)))
      .toBeGreaterThan(0.9);
    const box = await crack.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

    await page.getByRole("heading", { level: 2, name: "Private by default" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { level: 2, name: "Private by default" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });

  test("keyboard focus moves through the story in order and is never covered", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => storyState(page)).toBe("waiting");
    await page.keyboard.press("Tab");
    await expect.poll(() => storyState(page), { timeout: 30_000 }).toBe("3d");

    const dawnStart = page.locator('[data-scene="dawn"]').getByRole("link", { name: "Start your first day" });
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if (await dawnStart.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(dawnStart).toBeFocused();
    await expect(dawnStart).toBeInViewport({ ratio: 1 });
  });

  test("leaving the landing page tears the scene down", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => storyState(page)).toBe("waiting");
    await page.mouse.wheel(0, 100);
    await expect.poll(() => storyState(page), { timeout: 30_000 }).toBe("3d");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("link", { name: "See how it works" }).click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.locator(".story-canvas")).toHaveCount(0);
    // After the page's view transition ends, smooth scrolling is gone too.
    await expect.poll(() => page.evaluate(() => document.documentElement.className)).not.toMatch(/lenis/);
    await expect(page.locator(".pin-spacer")).toHaveCount(0);
  });

  test("a narrow, short window keeps the story readable (320 px)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await expect.poll(() => storyState(page)).toMatch(/^(waiting|static)$/);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => storyState(page), { timeout: 30_000 }).toMatch(/^(3d|static)$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    for (const heading of await page.locator("[data-story] h2").all()) {
      await heading.scrollIntoViewIfNeeded();
      const box = await heading.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
  });
});

test.describe("fallbacks: no canvas, no 3D", () => {
  test.use({ storageState: signedOut });

  async function expectStatic(page: Page, state: string) {
    await expect.poll(() => storyState(page)).toBe(state);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(1500);
    await expect(page.locator(".story-canvas")).toHaveCount(0);
    await expect(story(page)).not.toHaveClass(/story--3d/);
    await expect(page.locator(".pin-spacer")).toHaveCount(0);
    expect(await threeRequests(page)).toEqual([]);
    // No SplitText: the headline is still plain text.
    expect(await page.locator("[data-story] h1 > *").count()).toBe(0);
  }

  test("reduced motion: only simple fades", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expectStatic(page, "fade");
    // Every scene arrives fully visible once scrolled to.
    for (const scene of await page.locator(".story-scene").all()) {
      await scene.scrollIntoViewIfNeeded();
      await expect(scene).toHaveCSS("opacity", "1");
    }
  });

  test("no WebGL", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto("/");
    await expect.poll(() => storyState(page)).toBe("waiting");
    await page.mouse.wheel(0, 100);
    await expectStatic(page, "static");
  });

  test("low memory", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "deviceMemory", { get: () => 2 }));
    await page.goto("/");
    await expectStatic(page, "static");
  });

  test("Save-Data", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "connection", { get: () => ({ saveData: true }) }));
    await page.goto("/");
    await expectStatic(page, "static");
  });
});

test.describe("the app never loads the story", () => {
  test("no app route's scripts contain three.js, GSAP or Lenis", async ({ page }) => {
    const seen = new Set<string>();
    for (const route of appRoutes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const urls = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((name) => name.endsWith(".js")),
      );
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        const body = await (await page.request.get(url)).text();
        expect(body.includes(THREE_MARKER), `${route}: ${url}`).toBe(false);
        expect(/ScrollTrigger|lenis-smooth/.test(body), `${route}: ${url}`).toBe(false);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
