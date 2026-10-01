import { allRoutes, expectNoAxeViolations, setTheme, test, themes } from "./fixtures";

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
