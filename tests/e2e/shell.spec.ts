import { appRoutes, expect, test } from "./fixtures";

test("the SOS button is visible on every app screen and opens the sheet", async ({ page }) => {
  for (const route of appRoutes) {
    await page.goto(route);
    const sos = page.getByRole("button", { name: "SOS" });
    await expect(sos, route).toBeVisible();
    await expect(sos, route).toBeInViewport();
  }

  await page.goto("/home");
  const sos = page.getByRole("button", { name: "SOS" });
  await sos.click();
  const sheet = page.getByRole("dialog", { name: "Take a breath" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("1 Corinthians 10:13");

  // Escape closes it and focus goes back to the SOS button.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(sos).toBeFocused();

  // The close button works too.
  await sos.click();
  await page.getByRole("dialog", { name: "Take a breath" }).getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await expect(sos).toBeFocused();
});

test("navigation: bottom bar on phones, sidebar on desktop, current page marked", async ({ page, isMobile }) => {
  await page.goto("/groups");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toHaveCount(1); // the other layout's nav is hidden from everyone
  await expect(nav.getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Check in" }).click();
  await expect(page).toHaveURL(/\/check-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Check in" })).toBeVisible();

  const box = await nav.boundingBox();
  if (isMobile) expect(box!.y).toBeGreaterThan(500);
  else expect(box!.x).toBeLessThan(260);
});

test("every app page has one h1 and a main landmark", async ({ page }) => {
  for (const route of appRoutes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 }), route).toHaveCount(1);
    await expect(page.getByRole("main"), route).toHaveCount(1);
    await expect(page.locator("html"), route).toHaveAttribute("lang", "en");
  }
});

test("unknown pages return 404 with a way back", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response!.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This page isn’t here" })).toBeVisible();
  await page.getByRole("link", { name: "Go to Today" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("reflows at 320px with no sideways scrolling", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  for (const route of ["/", ...appRoutes, "/dev/components"]) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, route).toBeLessThanOrEqual(0);
  }
  await context.close();
});

test("text can be zoomed to 200% without losing content", async ({ page }) => {
  await page.goto("/home");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "SOS" })).toBeVisible();
});

test("reduced motion turns transitions off", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/home");
  const duration = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--duration-base").trim(),
  );
  expect(parseFloat(duration)).toBe(0);
  await context.close();
});
