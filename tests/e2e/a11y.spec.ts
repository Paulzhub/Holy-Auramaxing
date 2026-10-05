import { allRoutes, authRoutes, expectNoAxeViolations, setTheme, signedOut, test, themes } from "./fixtures";

for (const theme of themes) {
  test.describe(`axe, ${theme} theme`, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      await setTheme(context, baseURL!, theme);
    });

    for (const route of allRoutes) {
      test(`${route} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await expectNoAxeViolations(page, `${route} (${theme})`);
      });
    }

    test("SOS sheet open has no violations", async ({ page }) => {
      await page.goto("/home");
      await page.getByRole("button", { name: "SOS" }).click();
      await page.getByRole("dialog", { name: "Take a breath" }).waitFor();
      await expectNoAxeViolations(page, `SOS sheet (${theme})`);
    });

    test("component dialogs and toasts open have no violations", async ({ page }) => {
      await page.goto("/dev/components");
      await page.getByRole("button", { name: "Open dialog" }).click();
      await page.getByRole("dialog", { name: "Leave this group?" }).waitFor();
      await expectNoAxeViolations(page, `dialog (${theme})`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Open bottom sheet" }).click();
      await page.getByRole("dialog", { name: "Share an invite" }).waitFor();
      await expectNoAxeViolations(page, `bottom sheet (${theme})`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Show error toast" }).click();
      await page.getByRole("button", { name: "Show success toast" }).click();
      await expectNoAxeViolations(page, `toasts (${theme})`);
    });
  });
}

for (const theme of themes) {
  test.describe(`axe, sign-in and sign-up pages, ${theme} theme`, () => {
    test.use({ storageState: signedOut });
    test.beforeEach(async ({ context, baseURL }) => {
      await setTheme(context, baseURL!, theme);
    });

    for (const route of authRoutes) {
      test(`${route} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await expectNoAxeViolations(page, `${route} (${theme})`);
      });
    }

    test("sign-up steps, including the error states, have no violations", async ({ page }) => {
      await page.goto("/sign-up");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("alert", { name: "Please check the following" }).waitFor();
      await expectNoAxeViolations(page, `age step with errors (${theme})`);

      await page.getByLabel("Yes, I’m 18 or older").check();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL(/consent/);
      await expectNoAxeViolations(page, `consent step (${theme})`);
      await page.getByRole("button", { name: "I agree, continue" }).click();
      await page.getByRole("alert", { name: "Please check the following" }).waitFor();
      await expectNoAxeViolations(page, `consent step with errors (${theme})`);

      await page.getByLabel("I agree to the Terms and the Privacy Policy.").check();
      await page.getByLabel(/I agree that you may store and use my check-ins/).check();
      await page.getByRole("button", { name: "I agree, continue" }).click();
      await page.waitForURL(/account/);
      await expectNoAxeViolations(page, `account step (${theme})`);
      await page.getByRole("button", { name: "Create account" }).click();
      await page.getByRole("alert", { name: "Please check the following" }).waitFor();
      await expectNoAxeViolations(page, `account step with errors (${theme})`);
    });

    test("sign-in with an error and the magic-link panel open has no violations", async ({ page }) => {
      await page.goto("/sign-in");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByRole("alert", { name: "Please check the following" }).waitFor();
      await page.getByText("Email me a sign-in link instead").click();
      await expectNoAxeViolations(page, `sign-in with errors (${theme})`);
    });
  });
}
