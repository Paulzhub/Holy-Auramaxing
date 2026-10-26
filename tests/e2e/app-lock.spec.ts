import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { signInNewMember } from "./support/session";

// Phase 8b: the app lock (CLAUDE.md §7.10, D-113). A privacy screen kept on
// this device only: in place before any content paints, showing nothing but
// the app's name; PIN, or the device's fingerprint or face check; "Forgot
// PIN?" (and any sign-out) forgets it on this device.

const PIN = "246810";

async function setUpLock(page: Page, after = "1 minute") {
  await page.goto("/settings/security");
  const card = page.getByRole("region", { name: /App lock/ });
  await card.getByRole("button", { name: "Set up the lock" }).click();
  await card.getByLabel("New PIN (6 digits)").fill(PIN);
  await card.getByLabel("Enter the new PIN again").fill(PIN);
  await card.getByRole("radio", { name: after, exact: true }).check();
  await card.getByRole("button", { name: "Turn on the lock" }).click();
  await expect(card.getByText("The lock is on for this device.")).toBeVisible();
  return card;
}

function lockScreen(page: Page) {
  return page.getByRole("dialog", { name: "Holy Auramaxing" });
}

async function storage(page: Page, key: string) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

test.describe("app lock", () => {
  test.use({ storageState: signedOut });
  test.describe.configure({ timeout: 120_000 });

  test("locks, shows only the app's name, and opens with the PIN", async ({ page }) => {
    await signInNewMember(page, "lock-pin");
    const card = await setUpLock(page);
    // Nothing about the person is stored: a hash, never the PIN.
    const record = JSON.parse((await storage(page, "ha-lock"))!) as { pin: { hash: string }; owner: string };
    expect(JSON.stringify(record)).not.toContain(PIN);
    expect(record.owner).toMatch(/^[0-9a-f]{32}$/);

    await card.getByRole("button", { name: "Lock now" }).click();
    const lock = lockScreen(page);
    await expect(lock).toBeVisible();
    await expect(page.locator("main")).toBeHidden();
    await expect(page.locator("[data-lockable]")).toHaveAttribute("inert", "");
    await expect(lock.getByLabel("PIN")).toBeFocused();
    // Only the app's name and the lock's own controls.
    const words = (await lock.innerText()).replace(/\s+/g, " ").trim();
    expect(words).toBe("Holy Auramaxing PIN Unlock Forgot PIN? Sign out");
    await expectNoAxeViolations(page, "lock screen");

    await lock.getByLabel("PIN").fill("111111");
    await page.keyboard.press("Enter");
    await expect(lock.getByText("That PIN didn’t match.")).toBeVisible();
    await lock.getByLabel("PIN").fill(PIN);
    await lock.getByRole("button", { name: "Unlock" }).click();
    await expect(lock).toBeHidden();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lock now" })).toBeFocused();
  });

  test("is in place before any content paints after the time away", async ({ page }) => {
    await signInNewMember(page, "lock-boot");
    await setUpLock(page, "1 minute");
    // Away for two minutes: set before the next page's own scripts run (leaving a page
    // marks it as seen, so it can't be set from the page itself).
    await page.addInitScript(() => {
      if (sessionStorage.getItem("away-once")) return;
      sessionStorage.setItem("away-once", "1");
      localStorage.setItem("ha-lock-seen", String(Date.now() - 120_000));
    });
    // Hold back the app's JavaScript: only the HTML and the boot script run.
    await page.route("**/_next/static/chunks/**", async (route) => {
      await new Promise((r) => setTimeout(r, 4_000));
      await route.continue();
    });
    await page.goto("/journal", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-locked", "");
    await expect(page.locator("main")).toBeHidden();
    await expect(page.getByText("Holy Auramaxing", { exact: true }).last()).toBeVisible();
    await page.unroute("**/_next/static/chunks/**");
    await expect(lockScreen(page).getByLabel("PIN")).toBeEnabled({ timeout: 20_000 });
    await lockScreen(page).getByLabel("PIN").fill(PIN);
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeVisible();
  });

  test("within the time away it stays open, and a reload while locked stays locked", async ({ page }) => {
    await signInNewMember(page, "lock-time");
    await setUpLock(page, "5 minutes");
    await page.addInitScript(() => {
      if (sessionStorage.getItem("away-once")) return;
      sessionStorage.setItem("away-once", "1");
      localStorage.setItem("ha-lock-seen", String(Date.now() - 60_000));
    });
    await page.goto("/home");
    await expect(page.locator("main")).toBeVisible();
    await expect(lockScreen(page)).toBeHidden();
    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Lock now" }).click();
    await page.reload();
    await expect(lockScreen(page)).toBeVisible();
    await expect(page.locator("main")).toBeHidden();
  });

  test("a growing wait after five wrong tries", async ({ page }) => {
    await signInNewMember(page, "lock-wait");
    await setUpLock(page);
    await page.getByRole("button", { name: "Lock now" }).click();
    const lock = lockScreen(page);
    for (let i = 0; i < 5; i++) {
      await lock.getByLabel("PIN").fill("000000");
      await lock.getByRole("button", { name: "Unlock" }).click();
      await expect(lock.locator(".app-lock__message")).not.toBeEmpty();
      await expect(lock.getByRole("button", { name: "Unlock" })).not.toHaveAttribute("aria-busy", "true");
    }
    await expect(lock.getByText(/Too many tries for now\. You can try again at/)).toBeVisible();
    // Even the right PIN waits.
    await lock.getByLabel("PIN").fill(PIN);
    await lock.getByRole("button", { name: "Unlock" }).click();
    await expect(lock).toBeVisible();
    await page.reload();
    await lock.getByLabel("PIN").fill(PIN);
    await lock.getByRole("button", { name: "Unlock" }).click();
    await expect(lock.getByText(/Too many tries for now/)).toBeVisible();
  });

  test("“Forgot PIN?” signs out and forgets the lock on this device", async ({ page }) => {
    const me = await signInNewMember(page, "lock-forgot");
    await setUpLock(page);
    await page.getByRole("button", { name: "Lock now" }).click();
    await lockScreen(page).getByRole("button", { name: "Forgot PIN? Sign out" }).click();
    await expect(page).toHaveURL(/\/\?notice=signed-out$/);
    expect(await storage(page, "ha-lock")).toBeNull();
    // Sign in again: no lock.
    await page.goto("/sign-in");
    await page.locator("#email").fill(me.email);
    await page.locator("#current-password").fill(me.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator("main")).toBeVisible();
    await expect(lockScreen(page)).toBeHidden();
  });

  test("any sign-out on this device forgets it too", async ({ page }) => {
    await signInNewMember(page, "lock-signout");
    await setUpLock(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/\?notice=signed-out$/);
    expect(await storage(page, "ha-lock")).toBeNull();
  });

  test("another account on the same device never meets someone else's lock", async ({ page, context }) => {
    await signInNewMember(page, "lock-owner-a");
    await setUpLock(page);
    await page.getByRole("button", { name: "Lock now" }).click();
    // A's session ends without a sign-out here (say, it expired); B signs in.
    await context.clearCookies();
    await signInNewMember(page, "lock-owner-b");
    await expect(page.locator("main")).toBeVisible();
    await expect(lockScreen(page)).toBeHidden();
    expect(await storage(page, "ha-lock")).toBeNull();
  });

  test("turning it off asks for the PIN", async ({ page }) => {
    await signInNewMember(page, "lock-off");
    const card = await setUpLock(page);
    await card.getByRole("button", { name: "Turn off the lock" }).click();
    await card.getByLabel("Current PIN").fill("999999");
    await card.getByRole("button", { name: "Turn it off" }).click();
    await expect(card.getByText("That isn’t the current PIN.")).toBeVisible();
    await card.getByLabel("Current PIN").fill(PIN);
    await card.getByRole("button", { name: "Turn it off" }).click();
    await expect(card.getByText("The lock is off for this device.")).toBeVisible();
    expect(await storage(page, "ha-lock")).toBeNull();
  });

  test.describe("fingerprint or face", () => {
    test("unlocks with the device's own check (a virtual authenticator)", async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send("WebAuthn.enable");
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
      await signInNewMember(page, "lock-device");
      const card = await setUpLock(page);
      await card.getByRole("button", { name: "Also unlock with fingerprint or face" }).click();
      await expect(card.getByText("You can now unlock with your fingerprint or face.")).toBeVisible();
      await card.getByRole("button", { name: "Lock now" }).click();
      const lock = lockScreen(page);
      await lock.getByRole("button", { name: "Use fingerprint or face" }).click();
      await expect(lock).toBeHidden();
      await expect(page.locator("main")).toBeVisible();
    });
  });
});
