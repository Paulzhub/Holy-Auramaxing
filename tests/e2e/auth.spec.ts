import { type Page } from "@playwright/test";

import { expect, signedOut, test } from "./fixtures";
import {
  admin,
  createConfirmedUser,
  findUserId,
  hibpReachable,
  strongPassword,
  supabaseUrl,
  uniqueEmail,
  waitForEmailLink,
} from "./support/supabase";

test.use({ storageState: signedOut });

const sensitiveWords = ["porn", "fap", "lust", "relapse", "addiction", "masturbat", "streak"];

/** Opens an email link on the app under test (emails point at the configured site URL). */
async function openEmailLink(page: Page, link: URL) {
  await page.goto(`${link.pathname}${link.search}`);
}

async function passAgeAndConsent(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Yes, I’m 18 or older").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/sign-up\/consent$/);
  await page.getByLabel("I agree to the Terms and the Privacy Policy.").check();
  await page.getByLabel(/I agree that you may store and use my check-ins/).check();
  await page.getByRole("button", { name: "I agree, continue" }).click();
  await expect(page).toHaveURL(/\/sign-up\/account$/);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOutFromSettings(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/\?notice=signed-out$/);
  await expect(page.getByRole("status")).toContainText("You’re signed out");
}

// --------------------------------------------------------------- age gate

test("answering “under 18” creates nothing and can't be skipped past", async ({ page, context }) => {
  await page.goto("/sign-up");
  await page.getByLabel("No, I’m under 18").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/sign-up\/under-18$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you for being honest");
  await expect(page.getByText("Tele-MANAS")).toBeVisible();

  // Nothing about this visitor is kept, not even a cookie.
  const names = (await context.cookies()).map((c) => c.name);
  expect(names).not.toContain("signup_adult");
  expect(names).not.toContain("signup_ticket");

  // The later steps send them back to the start.
  await page.goto("/sign-up/consent");
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.goto("/sign-up/account");
  await expect(page).toHaveURL(/\/sign-up\?notice=expired$/);

  // And the database itself refuses an account that skipped the age gate.
  const email = uniqueEmail("under18");
  const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email, password: strongPassword() }),
  });
  expect(res.ok).toBe(false);
  expect(await findUserId(email)).toBeUndefined();
});

test("consent: both boxes start unticked and are required, with an error summary", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Continue" }).click();
  const ageSummary = page.getByRole("alert", { name: "Please check the following" });
  await expect(ageSummary).toContainText("Choose whether you are 18 or older.");
  await expect(ageSummary).toBeFocused();

  await page.getByLabel("Yes, I’m 18 or older").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/sign-up\/consent$/);

  const terms = page.getByLabel("I agree to the Terms and the Privacy Policy.");
  const sensitive = page.getByLabel(/I agree that you may store and use my check-ins/);
  await expect(terms).not.toBeChecked();
  await expect(sensitive).not.toBeChecked();
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Terms" }).first()).toHaveAttribute("href", "/terms");

  await page.getByRole("button", { name: "I agree, continue" }).click();
  const summary = page.getByRole("alert", { name: "Please check the following" });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveCount(2);
  await summary.getByRole("link", { name: /Terms and Privacy Policy/ }).click();
  await expect(terms).toBeFocused();
});

// ---------------------------------------------------------- email sign-up

test("sign up with email, confirm, sign out, sign in again", async ({ page }) => {
  const email = uniqueEmail("signup");
  const password = strongPassword();

  await passAgeAndConsent(page);
  await page.locator("#email").fill(email);
  await page.locator("#new-password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/sign-up\/check-email$/);

  // Until the email is confirmed, the password doesn't sign in.
  const { subject, link, html } = await waitForEmailLink(email, /Confirm your email/);
  expect(subject).toBe("Confirm your email for Holy Auramaxing");
  for (const word of sensitiveWords) expect(html.toLowerCase()).not.toContain(word);

  await openEmailLink(page, link);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm your email");
  await page.getByRole("button", { name: "Continue" }).click();
  // New accounts start with onboarding; skipping it goes to Today.
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole("button", { name: "Skip setup" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // The account exists with an 18+ confirmation and both consents.
  const userId = (await findUserId(email))!;
  const { data: profile } = await admin()
    .from("profiles")
    .select("handle, adult_confirmed_at")
    .eq("id", userId)
    .single();
  expect(profile!.handle).toMatch(/^friend_/);
  expect(profile!.adult_confirmed_at).toBeTruthy();
  const { data: consents } = await admin().from("consents").select("kind").eq("user_id", userId);
  expect(consents!.map((c) => c.kind).sort()).toEqual(["sensitive_data", "terms_privacy"]);

  await signOutFromSettings(page);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fhome$/);

  // A wrong password: error summary, focus moves to it, the email is kept.
  await page.locator("#email").fill(email);
  await page.locator("#current-password").fill("not my password at all");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const alert = page.getByRole("alert", { name: "Please check the following" });
  await expect(alert).toContainText("That email and password don’t match");
  await expect(alert).toBeFocused();
  await expect(page.locator("#email")).toHaveValue(email);

  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("a breached password is refused at sign-up", async ({ page }) => {
  test.skip(!(await hibpReachable()), "Have I Been Pwned is not reachable from this machine");
  await passAgeAndConsent(page);
  await page.locator("#email").fill(uniqueEmail("breached"));
  await page.locator("#new-password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert", { name: "Please check the following" })).toContainText(
    "appeared in a data breach",
  );
  await expect(page.locator("#new-password-error")).toBeVisible();
});

// --------------------------------------------------------- password reset

test("reset a forgotten password from the emailed link", async ({ page }) => {
  const email = uniqueEmail("reset");
  const oldPassword = strongPassword();
  const newPassword = strongPassword();
  await createConfirmedUser(email, oldPassword);

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "reset link is on its way" })).toBeVisible();

  const { subject, link } = await waitForEmailLink(email, /Reset your Holy Auramaxing password/);
  expect(subject).toBe("Reset your Holy Auramaxing password");
  await openEmailLink(page, link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);

  await page.locator("#new-password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/home\?notice=password-updated$/);

  await signOutFromSettings(page);
  await signIn(page, email, oldPassword);
  await expect(page.getByRole("alert", { name: "Please check the following" })).toContainText("don’t match");
  await signIn(page, email, newPassword);
  await expect(page).toHaveURL(/\/home$/);
});

test("an emailed link works only once", async ({ page }) => {
  const email = uniqueEmail("once");
  await createConfirmedUser(email, strongPassword());
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  const { link } = await waitForEmailLink(email, /Reset your Holy Auramaxing password/);

  await openEmailLink(page, link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);

  await page.context().clearCookies();
  await openEmailLink(page, link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?notice=link-invalid$/);
  await expect(page.getByRole("status")).toContainText("expired or was already used");
});

// ------------------------------------------------------------- magic link

test("sign in with a magic link; unknown addresses look the same", async ({ page }) => {
  const email = uniqueEmail("magic");
  await createConfirmedUser(email, strongPassword());

  await page.goto("/sign-in");
  await page.getByText("Email me a sign-in link instead").click();
  await page.locator("#magicLink-email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  const sent = page.getByRole("status").filter({ hasText: "sign-in link is on its way" });
  await expect(sent).toBeVisible();

  const { subject, link } = await waitForEmailLink(email, /sign-in link/);
  expect(subject).toBe("Your Holy Auramaxing sign-in link");
  await openEmailLink(page, link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Someone without an account gets exactly the same answer, and no email.
  await page.context().clearCookies();
  const stranger = uniqueEmail("stranger");
  await page.goto("/sign-in");
  await page.getByText("Email me a sign-in link instead").click();
  await page.locator("#magicLink-email").fill(stranger);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "sign-in link is on its way" })).toBeVisible();
  await expect(waitForEmailLink(stranger, /./, 2500)).rejects.toThrow();
});

// ----------------------------------------------------------------- Google

test("“Continue with Google” goes to Supabase's Google sign-in", async ({ page }) => {
  await page.goto("/sign-in");
  const authorize = page.waitForRequest((req) =>
    req.url().startsWith(`${supabaseUrl}/auth/v1/authorize?provider=google`),
  );
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const request = await authorize;
  const redirect = new URL(request.url()).searchParams.get("redirect_to") ?? "";
  expect(redirect).toContain("/api/auth/callback");
});

test("Google sign-up without the age and consent steps is sent back to the start", async ({ page }) => {
  // The account step needs the earlier answers; without them it starts over.
  await page.goto("/sign-up/account");
  await expect(page).toHaveURL(/\/sign-up\?notice=expired$/);
  await expect(page.getByRole("status")).toContainText("started again");
});

// ------------------------------------------------- keyboard and password managers

async function tabTo(page: Page, selector: string, maxPresses = 40) {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if (await page.locator(selector).evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Could not reach ${selector} with Tab`);
}

test("sign-up and sign-in work with the keyboard alone", async ({ page }) => {
  const email = uniqueEmail("keyboard");
  const password = strongPassword();

  await page.goto("/sign-up");
  await tabTo(page, "#adult-yes");
  await page.keyboard.press("Space");
  await tabTo(page, "main form button[type=submit]");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sign-up\/consent$/);

  await tabTo(page, "#consent-terms");
  await page.keyboard.press("Space");
  await tabTo(page, "#consent-sensitive");
  await page.keyboard.press("Space");
  await tabTo(page, "main form button[type=submit]");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sign-up\/account$/);

  await tabTo(page, "#email");
  await page.keyboard.type(email);
  await tabTo(page, "#new-password");
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sign-up\/check-email$/);

  const { link } = await waitForEmailLink(email, /Confirm your email/);
  await openEmailLink(page, link);
  await tabTo(page, "main form button[type=submit]");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/welcome$/);

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await tabTo(page, "#email");
  await page.keyboard.type(email);
  await tabTo(page, "#current-password");
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
  // Not onboarded yet, so signing in continues onboarding.
  await expect(page).toHaveURL(/\/welcome$/);
});

test("forms are built for password managers: stable ids, autocomplete, paste allowed", async ({ page }) => {
  await page.goto("/sign-in");
  const email = page.locator("#email");
  const current = page.locator("#current-password");
  await expect(email).toHaveAttribute("type", "email");
  await expect(email).toHaveAttribute("name", "email");
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(current).toHaveAttribute("type", "password");
  await expect(current).toHaveAttribute("autocomplete", "current-password");
  await expect(page.locator("form:has(#current-password) button[type=submit]")).toHaveCount(1);

  // Pasting is never blocked.
  const pasteBlocked = await current.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "pasted secret");
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    return !el.dispatchEvent(event);
  });
  expect(pasteBlocked).toBe(false);

  // Show password reveals and hides the text, and says which state it's in.
  const toggle = page.getByRole("button", { name: "Show password" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(current).toHaveAttribute("type", "text");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(current).toHaveAttribute("type", "password");

  await passAgeAndConsent(page);
  await expect(page.locator("#new-password")).toHaveAttribute("autocomplete", "new-password");
  await expect(page.locator("#email")).toHaveAttribute("autocomplete", "username");
});

test("a signed-out visitor is sent to sign in and brought back afterwards", async ({ page }) => {
  const email = uniqueEmail("next");
  const password = strongPassword();
  await createConfirmedUser(email, password);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
  await page.locator("#email").fill(email);
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("“next” can't send people to another site", async ({ page }) => {
  const email = uniqueEmail("redirect");
  const password = strongPassword();
  await createConfirmedUser(email, password);
  await page.goto("/sign-in?next=//evil.example/steal");
  await page.locator("#email").fill(email);
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/localhost:\d+\/home$/);
});
