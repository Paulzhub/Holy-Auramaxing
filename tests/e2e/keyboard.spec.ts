import { type Page } from "@playwright/test";

import { allRoutes, authRoutes, expect, setTheme, signedOut, test, themes } from "./fixtures";

interface FocusInfo {
  description: string;
  visibleIndicator: boolean;
  obscured: boolean;
  isBody: boolean;
}

/** What the browser shows for the element that currently has focus. */
async function inspectFocus(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body)
      return { description: "body", visibleIndicator: false, obscured: false, isBody: true };
    const style = getComputedStyle(el);
    const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
    const ring = style.boxShadow !== "none";
    // WCAG 2.4.11: the focused element must not be entirely hidden by sticky UI.
    el.scrollIntoView({ block: "nearest" });
    const rect = el.getBoundingClientRect();
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + 2, rect.top + 2],
      [rect.right - 2, rect.bottom - 2],
    ] as const;
    const visiblePoints = points.filter(([x, y]) => {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
    });
    return {
      description: `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`,
      visibleIndicator: outline || ring,
      obscured: visiblePoints.length === 0,
      isBody: false,
    };
  });
}

async function checkFocusStops(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  const failures: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press("Tab");
    const info = await inspectFocus(page);
    if (info.isBody) break;
    const key = `${info.description}#${i}`;
    if (!info.visibleIndicator) failures.push(`no focus indicator: ${info.description}`);
    if (info.obscured) failures.push(`hidden behind other content: ${info.description}`);
    seen.add(key);
    const id = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement & { __tabSeen?: boolean };
      const again = Boolean(el.__tabSeen);
      el.__tabSeen = true;
      return again;
    });
    if (id) break; // wrapped around
  }
  expect(seen.size, "page should have focusable controls").toBeGreaterThan(0);
  expect(failures).toEqual([]);
}

for (const theme of themes) {
  test.describe(`keyboard, ${theme} theme`, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      await setTheme(context, baseURL!, theme);
    });

    for (const route of allRoutes) {
      test(`${route}: every stop shows a focus ring and is not hidden`, async ({ page }) => {
        await checkFocusStops(page, route);
      });
    }

    test.describe("signed out", () => {
      test.use({ storageState: signedOut });
      for (const route of authRoutes) {
        test(`${route}: every stop shows a focus ring and is not hidden`, async ({ page }) => {
          await checkFocusStops(page, route);
        });
      }
    });
  });
}

test("skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/home");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});
