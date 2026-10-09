import type { Page } from "@playwright/test";

import { allRoutes, authRoutes, expect, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs } from "./support/groups";
import { signInNewMember } from "./support/session";

// Accessibility review 1 (docs/accessibility-review-1.md): checks the axe and
// keyboard suites don't cover — reflow at 320 px, short screens, reduced
// motion, names that give context, and page titles.

/** Elements wider than the viewport, outside any sideways-scrolling box. */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1)
      out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || el.closest(".visually-hidden, [aria-hidden=true]")) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      let p = el.parentElement;
      let inScroller = false;
      while (p) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) inScroller = true;
        p = p.parentElement;
      }
      if (!inScroller && (rect.right > vw + 1 || rect.left < -1))
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} [${Math.round(rect.left)}, ${Math.round(rect.right)}]`,
        );
    }
    return out.slice(0, 10);
  });
}

test.describe("reflow at 320 px (WCAG 1.4.10)", () => {
  test.skip(({ isMobile }) => isMobile, "sets its own viewport");
  test.use({ viewport: { width: 320, height: 568 } });

  for (const route of allRoutes) {
    test(`${route} fits without sideways scrolling`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(await overflowing(page)).toEqual([]);
    });
  }

  test.describe("signed out", () => {
    test.use({ storageState: signedOut });
    for (const route of authRoutes) {
      test(`${route} fits without sideways scrolling`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        expect(await overflowing(page)).toEqual([]);
      });
    }
  });
});

test.describe("group switcher", () => {
  test.skip(({ isMobile }) => isMobile, "sets its own viewport");
  test.use({ storageState: signedOut });

  for (const width of [320, 380, 480, 640]) {
    test(`its menu opens fully on screen at ${width} px`, async ({ page }) => {
      const me = await signInNewMember(page, `switcher-${width}`);
      await createGroupAs(await apiAs(me), "A group with a long name for the narrow screen test");
      await page.setViewportSize({ width, height: 568 });
      await page.goto("/home");
      const topbar = page.locator(".shell-topbar");
      await topbar.locator("summary").click();
      const panel = topbar.locator(".group-switcher__panel");
      await expect(panel).toBeVisible();
      const box = (await panel.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await expect(panel.getByRole("link", { name: "All groups" })).toBeInViewport();
      await expect(panel.getByRole("link", { name: "Start a group" })).toBeInViewport();
      expect(await overflowing(page)).toEqual([]);
    });
  }

  test('"Your groups" is never cut short', async ({ page }) => {
    await signInNewMember(page, "switcher-label");
    await page.setViewportSize({ width: 640, height: 430 });
    await page.goto("/home");
    const label = page.locator(".shell-topbar .group-switcher__current");
    await expect(label).toHaveText("Your groups");
    const clipped = await label.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
  });
});

test.describe("short screens (200% zoom on a laptop)", () => {
  test.skip(({ isMobile }) => isMobile, "sets its own viewport");
  test.use({ viewport: { width: 640, height: 430 } });

  test("the top bar scrolls away so content keeps most of the screen", async ({ page }) => {
    await page.goto("/home");
    await page.mouse.wheel(0, 400);
    await expect(page.locator(".shell-topbar")).not.toBeInViewport();
    await expect(page.getByRole("button", { name: "SOS" })).toBeInViewport();
  });
});

test.describe("reduced motion (WCAG 2.3.3)", () => {
  test.skip(({ isMobile }) => isMobile, "one viewport is enough");
  test.use({ reducedMotion: "reduce" });

  for (const route of ["/home", "/check-in", "/progress", "/groups", "/dev/components"]) {
    test(`${route} runs no animations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => {
            const d = a.effect?.getComputedTiming().duration;
            return typeof d !== "number" || d > 20;
          })
          .map((a) => String((a as CSSAnimation).animationName ?? "animation")),
      );
      expect(running).toEqual([]);
    });
  }
});

test.describe("names that say what they act on", () => {
  test.skip(({ isMobile }) => isMobile, "one viewport is enough");
  test.use({ storageState: signedOut });

  test("the current check-in answer is announced (WCAG 1.3.1)", async ({ page }) => {
    await signInNewMember(page, "a11y-current");
    await page.goto("/check-in");
    await page.getByRole("button", { name: /I stayed free today/ }).click();
    await expect(page).toHaveURL(/\/check-in\/done/);
    await page.goto("/check-in");
    await page.getByText("Change your answer").click();
    const clean = page.getByRole("button", { name: "I stayed free today (your answer now)" });
    await expect(clean).toBeVisible();
    await expect(clean).toHaveClass(/(^|\s)checkin-choice--current(\s|$)/);
    await expect(page.getByRole("button", { name: "I slipped", exact: true })).toBeVisible();
  });

  test("each invite's actions name the invite (WCAG 2.4.6)", async ({ page }) => {
    const me = await signInNewMember(page, "a11y-invites");
    const owner = await apiAs(me);
    const groupId = await createGroupAs(owner, "Invite names");
    await createInviteAs(owner, groupId, { days: 1 });
    await createInviteAs(owner, groupId, { days: 7 });
    await page.goto(`/groups/${groupId}/invites`);
    const groups = page.getByRole("group", { name: /^Invite made .+, working until .+$/ });
    await expect(groups).toHaveCount(2);
    const [first, second] = [
      await groups.nth(0).getAttribute("aria-label"),
      await groups.nth(1).getAttribute("aria-label"),
    ];
    expect(first).not.toEqual(second);
    await expect(groups.nth(0).getByRole("button", { name: "Replace with a new one" })).toBeVisible();
  });
});

test.describe("page titles (WCAG 2.4.2)", () => {
  test.skip(({ isMobile }) => isMobile, "one viewport is enough");
  test.use({ storageState: signedOut });

  test("each sign-up step has its own title", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page).toHaveTitle(/^Create your account, step 1 of 3 \|/);
    await page.getByLabel("Yes, I’m 18 or older").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/consent/);
    await expect(page).toHaveTitle(/^Create your account, step 2 of 3 \|/);
    await page.getByLabel("I agree to the Terms and the Privacy Policy.").check();
    await page.getByLabel(/I agree that you may store and use my check-ins/).check();
    await page.getByRole("button", { name: "I agree, continue" }).click();
    await page.waitForURL(/account/);
    await expect(page).toHaveTitle(/^Create your account, step 3 of 3 \|/);
    await page.goto("/sign-up/under-18");
    await expect(page).toHaveTitle(/^Thank you for being honest \|/);
  });
});
