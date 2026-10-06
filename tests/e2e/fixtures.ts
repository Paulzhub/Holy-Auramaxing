import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

export const appRoutes = [
  "/home",
  "/groups",
  "/check-in",
  "/alerts",
  "/me",
  "/settings",
  "/settings/security",
] as const;
export const allRoutes = ["/", ...appRoutes, "/dev/components", "/this-page-does-not-exist"] as const;
/** Pages for signed-out visitors (axe, keyboard and password-manager checks in auth.spec.ts). */
export const authRoutes = [
  "/sign-in",
  "/sign-up",
  "/sign-up/under-18",
  "/sign-up/check-email",
  "/forgot-password",
  "/confirm?token_hash=abcdefgh12345678&type=signup",
  "/privacy",
  "/terms",
  "/your-data",
] as const;
/** A fresh, signed-out browser state. */
export const signedOut = { cookies: [], origins: [] };
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

/** A made-up client address per test, so the app's per-IP rate limits don't add up across the suite. */
function testClientIp(): string {
  const n = () => Math.floor(Math.random() * 254) + 1;
  return `10.${n()}.${n()}.${n()}`;
}

/** Fails the test if the page logs a CSP violation or an uncaught error. */
export const test = base.extend<{ consoleGuard: void; clientIp: void }>({
  clientIp: [
    async ({ context }, use) => {
      await context.setExtraHTTPHeaders({ "x-forwarded-for": testClientIp() });
      await use();
    },
    { auto: true },
  ],
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
