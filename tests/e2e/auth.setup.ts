import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test as setup } from "@playwright/test";

import { createConfirmedUser, findUserId, strongPassword } from "./support/supabase";

export const MEMBER_STATE = "tests/e2e/.auth/member.json";
export const MEMBER_EMAIL = "e2e-member@example.test";

/**
 * Creates (or reuses) one signed-in member and saves the session cookies,
 * so specs about the app itself start signed in. Signs in through the real
 * form, which also checks that the password sign-in flow works.
 */
setup("sign in the shared test member", async ({ page }) => {
  const password = strongPassword();
  const existing = await findUserId(MEMBER_EMAIL);
  if (existing) {
    const { admin } = await import("./support/supabase");
    await admin().auth.admin.updateUserById(existing, { password });
    await admin().from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", existing);
  } else {
    await createConfirmedUser(MEMBER_EMAIL, password);
  }

  await page.goto("/sign-in");
  await page.locator("#email").fill(MEMBER_EMAIL);
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);

  mkdirSync(dirname(MEMBER_STATE), { recursive: true });
  await page.context().storageState({ path: MEMBER_STATE });
});
