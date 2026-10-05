import { expect, type Page } from "@playwright/test";

import { createConfirmedUser, strongPassword, uniqueEmail } from "./supabase";

/**
 * Creates a fresh confirmed member and signs in through the real form.
 * Tests that change a profile use their own member, so they can run in
 * parallel with everything that uses the shared one.
 */
export async function signInNewMember(
  page: Page,
  label: string,
  { onboarded = true }: { onboarded?: boolean } = {},
): Promise<{ email: string; password: string; userId: string }> {
  const email = uniqueEmail(label);
  const password = strongPassword();
  const userId = await createConfirmedUser(email, password, { onboarded });
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(onboarded ? /\/home$/ : /\/welcome$/);
  return { email, password, userId };
}
