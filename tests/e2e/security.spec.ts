import { type Browser, type Page } from "@playwright/test";

import { expect, expectNoAxeViolations, setTheme, signedOut, test, themes } from "./fixtures";
import { createConfirmedUser, listEmails, strongPassword, uniqueEmail, waitForEmail } from "./support/supabase";
import { freshTotp, totp } from "./support/totp";
import { addVirtualAuthenticator } from "./support/webauthn";

// Phase 2d: two-step sign-in, recovery codes, passkeys, sessions, security emails.
test.use({ storageState: signedOut });

const sensitive = /porn|fap|lust|relapse|addiction|masturbat|streak|sexual|temptation/i;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOut(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/\?notice=signed-out$/);
}

async function newMember(label: string) {
  const email = uniqueEmail(label);
  const password = strongPassword();
  await createConfirmedUser(email, password);
  return { email, password };
}

/** Turns on two-step sign-in from Settings → Security. Returns the secret, the codes and when the code was used. */
async function enableTwoStep(page: Page) {
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Set up an authenticator app" }).click();
  await expect(page.getByRole("heading", { name: "Scan this code" })).toBeFocused();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const secret = (await page.locator(".security-key code").innerText()).replace(/\s/g, "");
  const usedAt = Date.now();
  await page.getByLabel("Then enter the 6-digit code the app shows").fill(totp(secret, usedAt));
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeFocused();
  const codes = await page.getByRole("list", { name: "Your recovery codes" }).getByRole("listitem").allInnerTexts();
  expect(codes).toHaveLength(10);
  for (const code of codes) expect(code).toMatch(/^[0-9a-z]{5}-[0-9a-z]{5}$/);
  return { secret, codes, usedAt };
}

test.describe("two-step sign-in with an authenticator app", () => {
  test("set up, then every sign-in asks for the code; wrong codes are refused", async ({ page }) => {
    const { email, password } = await newMember("totp");
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/home$/);

    const { secret, usedAt } = await enableTwoStep(page);
    await page.getByRole("button", { name: "I’ve saved them" }).click();
    await expect(page.getByRole("heading", { name: /Two-step sign-in/ })).toContainText("On");
    await expect(page.getByText("You have 10 recovery codes left.")).toBeVisible();
    // Supabase sends its own discreet notice.
    const enrolled = await waitForEmail(email, /Two-step sign-in is on/);
    expect(`${enrolled.subject} ${enrolled.html}`).not.toMatch(sensitive);

    await signOut(page);
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/sign-in\/verify\?next=%2Fhome$/);

    // A password alone opens nothing.
    await page.goto("/me");
    await expect(page).toHaveURL(/\/sign-in\/verify$/);

    await page.getByLabel("Code from your app").fill("000000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#code-error")).toContainText("That code didn’t work");
    await expect(page.getByRole("alert", { name: "Please check the following" })).toBeFocused();

    await page.getByLabel("Code from your app").fill(await freshTotp(secret, usedAt));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/me");
    await expect(page).toHaveURL(/\/me$/);
  });

  test("a recovery code signs in once, turns two-step off and emails the person", async ({ page }) => {
    const { email, password } = await newMember("recovery");
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/home$/);
    const { codes } = await enableTwoStep(page);

    await signOut(page);
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/sign-in\/verify/);

    await page.getByText("Can’t use your app? Use a recovery code").click();
    await page.getByLabel("Recovery code").fill("zzzzz-zzzzz");
    await page.getByRole("button", { name: "Use recovery code" }).click();
    await expect(page.locator("#recovery-code-error")).toContainText("That recovery code didn’t work");

    // Typed loosely: upper case, no dash.
    await page.getByLabel("Recovery code").fill(codes[3]!.replace("-", "").toUpperCase());
    await page.getByRole("button", { name: "Use recovery code" }).click();
    await expect(page).toHaveURL(/\/settings\/security\?notice=recovery-used$/);
    await expect(page.getByRole("status")).toContainText("You signed in with a recovery code");
    await expect(page.getByRole("heading", { name: /Two-step sign-in/ })).toContainText("Off");

    const alert = await waitForEmail(email, /A recovery code was used/);
    expect(alert.from).toMatch(/^Holy Auramaxing </);
    expect(`${alert.subject} ${alert.html} ${alert.text}`).not.toMatch(sensitive);
    expect(alert.html).toContain("/settings/security");
  });

  test("turning two-step sign-in off removes it and its codes", async ({ page }) => {
    const { email, password } = await newMember("totp-off");
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/home$/);
    await enableTwoStep(page);
    await page.goto("/settings/security");
    await page.getByText("Turn off two-step sign-in").first().click();
    await page.getByRole("button", { name: "Turn off two-step sign-in" }).click();
    await expect(page).toHaveURL(/notice=two-step-off$/);
    await expect(page.getByRole("heading", { name: /Two-step sign-in/ })).toContainText("Off");

    await signOut(page);
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/home$/);
  });
});

test.describe("passkeys", () => {
  test("add, sign in, rename and remove a passkey", async ({ page }) => {
    const authenticator = await addVirtualAuthenticator(page);
    const { email, password } = await newMember("passkey");
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/settings/security");
    await expect(page.getByText("You haven’t added a passkey yet.")).toBeVisible();
    await page.getByRole("button", { name: "Add a passkey" }).click();
    await expect(page).toHaveURL(/notice=passkey-added$/);
    expect(await authenticator.credentialCount()).toBe(1);
    const list = page.getByRole("list", { name: "Your passkeys" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Not used yet");
    const added = await waitForEmail(email, /A passkey was added/);
    expect(`${added.subject} ${added.html}`).not.toMatch(sensitive);

    await signOut(page);
    await page.goto("/sign-in?next=%2Fme");
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page).toHaveURL(/\/me$/);

    await page.goto("/settings/security");
    await expect(list).toContainText("Last used");
    await page.getByText(/^Rename /).click();
    await page.getByLabel("New name").fill("Work laptop");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page).toHaveURL(/notice=passkey-renamed$/);
    await expect(list).toContainText("Work laptop");

    await page.getByText("Remove Work laptop").click();
    await page.getByRole("button", { name: "Remove passkey" }).click();
    await expect(page).toHaveURL(/notice=passkey-removed$/);
    await expect(page.getByText("You haven’t added a passkey yet.")).toBeVisible();
  });

  test("with two-step sign-in on, a passkey still needs the code", async ({ page }) => {
    await addVirtualAuthenticator(page);
    const { email, password } = await newMember("passkey-totp");
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/home$/);
    const { secret, usedAt } = await enableTwoStep(page);
    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Add a passkey" }).click();
    await expect(page).toHaveURL(/notice=passkey-added$/);

    await signOut(page);
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page).toHaveURL(/\/sign-in\/verify/);
    await page.getByLabel("Code from your app").fill(await freshTotp(secret, usedAt));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("a cancelled passkey prompt shows a gentle message", async ({ page }) => {
    // No authenticator: the browser's request fails as if the person cancelled.
    await page.goto("/sign-in");
    await page.evaluate(() => {
      navigator.credentials.get = () => Promise.reject(new DOMException("cancelled", "NotAllowedError"));
    });
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.locator(".ui-error-text")).toContainText("The passkey request was cancelled");
  });
});

async function signedInContext(browser: Browser, baseURL: string, email: string, password: string) {
  const context = await browser.newContext({ baseURL, storageState: signedOut });
  const page = await context.newPage();
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/home$/);
  return { context, page };
}

test.describe("devices and sessions", () => {
  test("new-device email, sign out one device, then everywhere", async ({ browser, baseURL }) => {
    const { email, password } = await newMember("sessions");
    const phone = await signedInContext(browser, baseURL!, email, password);
    // The account's first device: no email.
    const laptop = await signedInContext(browser, baseURL!, email, password);

    const alert = await waitForEmail(email, /New sign-in to your Holy Auramaxing account/);
    expect(alert.from).toMatch(/^Holy Auramaxing </);
    expect(alert.text).toMatch(/Chrome on (Linux|Windows|macOS|Android)/);
    expect(`${alert.subject} ${alert.html} ${alert.text}`).not.toMatch(sensitive);
    expect(await listEmails(email, /New sign-in/)).toHaveLength(1);

    // Signing in again on a known device sends nothing new.
    await signOut(laptop.page);
    await signIn(laptop.page, email, password);
    await expect(laptop.page).toHaveURL(/\/home$/);
    await laptop.page.waitForTimeout(1500);
    expect(await listEmails(email, /New sign-in/)).toHaveLength(1);

    await laptop.page.goto("/settings/security");
    const sessions = laptop.page.getByRole("list", { name: "Signed-in devices" }).getByRole("listitem");
    await expect(sessions).toHaveCount(2);
    await expect(sessions.filter({ hasText: "This device" })).toHaveCount(1);
    await expect(laptop.page.locator("body")).not.toContainText(/\b\d{1,3}(\.\d{1,3}){3}\b/); // no IP addresses

    await sessions
      .filter({ hasNotText: "This device" })
      .getByRole("button", { name: /^Sign out / })
      .click();
    await expect(laptop.page).toHaveURL(/notice=session-signed-out$/);
    await expect(sessions).toHaveCount(1);

    // The phone is signed out at once, not when its token expires.
    await phone.page.goto("/me");
    await expect(phone.page).toHaveURL(/\/sign-in\?notice=session-ended$/);
    await expect(phone.page.getByRole("status")).toContainText("You were signed out of this device");

    await laptop.page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(laptop.page).toHaveURL(/\/sign-in\?notice=signed-out-everywhere$/);
    await laptop.page.goto("/home");
    await expect(laptop.page).toHaveURL(/\/sign-in/);

    await phone.context.close();
    await laptop.context.close();
  });
});

for (const theme of themes) {
  test(`security pages have no WCAG 2.2 AA violations (${theme})`, async ({ page, context, baseURL }) => {
    await setTheme(context, baseURL!, theme);
    const { email, password } = await newMember(`a11y-${theme}`);
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/settings/security");
    await expectNoAxeViolations(page, `/settings/security (${theme})`);
    await page.getByRole("button", { name: "Set up an authenticator app" }).click();
    await expect(page.getByRole("heading", { name: "Scan this code" })).toBeVisible();
    await expectNoAxeViolations(page, `authenticator setup (${theme})`);

    const secret = (await page.locator(".security-key code").innerText()).replace(/\s/g, "");
    const usedAt = Date.now();
    await page.getByLabel("Then enter the 6-digit code the app shows").fill(totp(secret, usedAt));
    await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
    await expectNoAxeViolations(page, `recovery codes (${theme})`);

    await signOut(page);
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/sign-in\/verify/);
    await page.getByText("Can’t use your app? Use a recovery code").click();
    await expectNoAxeViolations(page, `/sign-in/verify (${theme})`);
    await page.goto("/sign-in");
    await expectNoAxeViolations(page, `/sign-in with passkey button (${theme})`);
  });
}

test("the code page and the authenticator setup work with the keyboard alone", async ({ page }) => {
  const { email, password } = await newMember("keyboard");
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/settings/security");

  const start = page.getByRole("button", { name: "Set up an authenticator app" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Scan this code" })).toBeFocused();
  const secret = (await page.locator(".security-key code").innerText()).replace(/\s/g, "");
  const usedAt = Date.now();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Then enter the 6-digit code the app shows")).toBeFocused();
  await page.keyboard.type(totp(secret, usedAt));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeFocused();

  await signOut(page);
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/sign-in\/verify/);
  // The only field on the page has focus already.
  await expect(page.getByLabel("Code from your app")).toBeFocused();
  await page.keyboard.type(await freshTotp(secret, usedAt));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/home$/);
});
