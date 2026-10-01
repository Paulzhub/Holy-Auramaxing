import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

export const appRoutes = ["/home", "/groups", "/check-in", "/alerts", "/me", "/settings"] as const;
export const allRoutes = ["/", ...appRoutes, "/dev/components", "/this-page-does-not-exist"] as const;
export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function setTheme(context: BrowserContext, baseURL: string, theme: Theme | "system") {
  await context.addCookies([{ name: "theme", value: theme, url: baseURL }]);
}

export async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
  }));
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

/** Fails the test if the page logs a CSP violation or an uncaught error. */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        const text = msg.text();
        if (msg.type() === "error" && /Content Security Policy|Refused to/i.test(text)) problems.push(text);
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      await use();
      expect(problems, "CSP violations or page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
