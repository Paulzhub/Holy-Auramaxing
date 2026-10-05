import { expect, setTheme, test } from "./fixtures";

const LIGHT_BG = "rgb(245, 243, 250)";
const DARK_BG = "rgb(19, 17, 43)";

const bodyBg = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("toggling to dark applies instantly and persists across reloads", async ({ page, isMobile }) => {
  await page.goto("/settings");
  const group = page.getByRole("group", { name: "Theme" }).last();
  await group.getByRole("button", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBg(page)).toBe(DARK_BG);
  // Every switcher on the page agrees (top bar on phones, sidebar on desktop, settings).
  for (const pressed of await page.getByRole("button", { name: "Dark", pressed: true }).all()) {
    await expect(pressed).toHaveAttribute("aria-pressed", "true");
  }

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBg(page)).toBe(DARK_BG);

  await page.goto(isMobile ? "/groups" : "/alerts");
  expect(await bodyBg(page)).toBe(DARK_BG);
});

test("no flash: the saved theme is in the server HTML, before any JavaScript runs", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await setTheme(context, baseURL!, "dark");
  const page = await context.newPage();
  await page.goto("/home");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBg(page)).toBe(DARK_BG);
  await context.close();
});

test("no flash: the first frame already has the right theme", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await setTheme(context, baseURL!, "dark");
  const page = await context.newPage();
  // Record the background on the very first animation frame, before first paint.
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      (window as unknown as { __firstFrameBg: string }).__firstFrameBg = getComputedStyle(
        document.documentElement,
      ).backgroundColor;
    });
  });
  await page.goto("/home");
  const first = await page.evaluate(() => (window as unknown as { __firstFrameBg?: string }).__firstFrameBg);
  expect(first).toBe(DARK_BG);
  await context.close();
});

test("the local cache restores the theme if the cookie was cleared", async ({ page }) => {
  // Signing in sets the cookie from the profile (D-006), so clear it for this case.
  await page.context().clearCookies({ name: "theme" });
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/home");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "theme")?.value).toBe("dark");
});

test("system follows the device, and a pinned choice overrides it", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/home");
  expect(await bodyBg(page)).toBe(DARK_BG);

  await setTheme(context, baseURL!, "light");
  await page.reload();
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  await context.close();
});

test("the switcher works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await page.goto("/settings");
  await page.getByRole("group", { name: "Theme" }).last().getByRole("button", { name: "Dark" }).click();
  await page.waitForLoadState("load");
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await context.close();
});
