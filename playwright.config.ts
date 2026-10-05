import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Same environment as the app (.env.local): Supabase URL and keys for test helpers.
loadEnvConfig(process.cwd());

const MEMBER_STATE = "tests/e2e/.auth/member.json";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
// Lets a pre-installed Chromium be used (e.g. in sandboxes); CI uses Playwright's own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    // Signs in one shared member; app specs reuse that session (auth.setup.ts).
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 860 },
        launchOptions: { executablePath },
        storageState: MEMBER_STATE,
      },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], launchOptions: { executablePath }, storageState: MEMBER_STATE },
    },
  ],
  webServer: {
    // Tests run against a production build: `npm run build` first.
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { ENABLE_DEV_PAGES: "true" },
    timeout: 60_000,
  },
});
