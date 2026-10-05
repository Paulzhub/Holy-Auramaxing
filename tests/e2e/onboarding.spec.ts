import { type Page } from "@playwright/test";

import { expect, expectNoAxeViolations, signedOut, test, themes, setTheme } from "./fixtures";
import { admin, createConfirmedUser, findUserId, strongPassword, uniqueEmail } from "./support/supabase";

test.use({ storageState: signedOut });

async function signInNewMember(page: Page, label: string) {
  const email = uniqueEmail(label);
  const password = strongPassword();
  await createConfirmedUser(email, password, { onboarded: false });
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  return { email, userId: (await findUserId(email))! };
}

test("a new member goes through all five steps and lands on Today", async ({ page }) => {
  const { userId } = await signInNewMember(page, "onboard");
  // The app sends people who haven't finished onboarding to /welcome.
  await expect(page).toHaveURL(/\/welcome$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/welcome$/);

  // 1. Welcome: grace message, verse, display name.
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await expect(page.getByText("Lamentations 3:22–23")).toBeVisible();
  await page.getByLabel("What should we call you?").fill("Sam 😊");
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. My why: private and encrypted.
  await expect(page).toHaveURL(/step=why$/);
  const why = "For my future family, and to be free to serve.";
  await page.getByLabel("My why (optional)").fill(why);
  await page.getByRole("button", { name: "Continue" }).click();

  // 3. Reminder and time zone.
  await expect(page).toHaveURL(/step=reminder$/);
  await page.getByLabel("Reminder time").fill("21:30");
  await page.getByLabel("Your time zone").selectOption("Europe/London");
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Discreet mode, on by default.
  await expect(page).toHaveURL(/step=discreet$/);
  await expect(page.getByLabel("Use discreet mode (recommended)")).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Groups (Phase 3), then finish.
  await expect(page).toHaveURL(/step=group$/);
  await expect(page.getByText("Coming soon", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Go to Today" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Everything was saved, and "my why" is stored encrypted, never as text.
  const db = admin();
  const { data: profile } = await db
    .from("profiles")
    .select("display_name, timezone, onboarded_at")
    .eq("id", userId)
    .single();
  expect(profile).toMatchObject({ display_name: "Sam 😊", timezone: "Europe/London" });
  expect(profile!.onboarded_at).toBeTruthy();
  const { data: settings } = await db
    .from("notification_settings")
    .select("reminder_time, discreet_mode")
    .eq("user_id", userId)
    .single();
  expect(settings).toEqual({ reminder_time: "21:30:00", discreet_mode: true });
  const { data: secret } = await db.from("profile_private").select("my_why_encrypted").eq("user_id", userId).single();
  expect(secret!.my_why_encrypted).toMatch(/^v1:/);
  expect(secret!.my_why_encrypted).not.toContain("family");

  // Coming back to /welcome after finishing goes straight to Today.
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/home$/);
});

test("every step can be skipped, and “Skip setup” finishes straight away", async ({ page }) => {
  const { userId } = await signInNewMember(page, "skip");
  await expect(page).toHaveURL(/\/welcome$/);

  // Continue with nothing typed keeps the default name.
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Skip this step" }).click();
  await expect(page).toHaveURL(/step=reminder$/);
  await page.getByRole("link", { name: "Skip this step" }).click();
  await expect(page).toHaveURL(/step=discreet$/);

  await page.getByRole("button", { name: "Skip setup" }).click();
  await expect(page).toHaveURL(/\/home$/);

  const db = admin();
  const { data: settings } = await db
    .from("notification_settings")
    .select("reminder_time, discreet_mode")
    .eq("user_id", userId)
    .single();
  expect(settings).toEqual({ reminder_time: null, discreet_mode: true });
  const { data: secret } = await db.from("profile_private").select("user_id").eq("user_id", userId);
  expect(secret).toEqual([]);
});

test("turning discreet mode off is remembered", async ({ page }) => {
  const { userId } = await signInNewMember(page, "discreet");
  await page.goto("/welcome?step=discreet");
  await page.getByLabel("Use discreet mode (recommended)").uncheck();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/step=group$/);
  const { data } = await admin().from("notification_settings").select("discreet_mode").eq("user_id", userId).single();
  expect(data!.discreet_mode).toBe(false);
});

test("a too-long name is refused with a message, and focus moves to it", async ({ page }) => {
  await signInNewMember(page, "longname");
  await page.getByLabel("What should we call you?").evaluate((el) => el.removeAttribute("maxlength"));
  await page.getByLabel("What should we call you?").fill("x".repeat(41));
  await page.getByRole("button", { name: "Continue" }).click();
  const error = page.getByRole("alert").filter({ hasText: "40 characters or fewer" });
  await expect(error).toBeFocused();
  await expect(page).toHaveURL(/\/welcome$/);
});

for (const theme of themes) {
  test(`every onboarding step has no WCAG 2.2 AA violations (${theme})`, async ({ page, context, baseURL }) => {
    await setTheme(context, baseURL!, theme);
    await signInNewMember(page, `axe-${theme}`);
    for (const step of ["welcome", "why", "reminder", "discreet", "group"]) {
      await page.goto(`/welcome?step=${step}`);
      await page.waitForLoadState("networkidle");
      await expectNoAxeViolations(page, `/welcome?step=${step} (${theme})`);
    }
  });
}

test("onboarding works with the keyboard alone", async ({ page }) => {
  await signInNewMember(page, "keys");
  await expect(page).toHaveURL(/\/welcome$/);
  const tabTo = async (selector: string) => {
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      if (await page.locator(selector).evaluate((el) => el === document.activeElement)) return;
    }
    throw new Error(`Could not reach ${selector}`);
  };
  await tabTo("#displayName");
  await page.keyboard.type("Keys");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/step=why$/);
  await tabTo("#myWhy");
  await page.keyboard.type("Freedom");
  await tabTo("main form button[type=submit]");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/step=reminder$/);
});
