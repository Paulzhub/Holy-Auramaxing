import { expect } from "@playwright/test";

import { signedOut, test } from "./fixtures";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 8b: daily reading (CLAUDE.md §7.9, D-112). The database rules (XP
// once ever, never levels, owner-only progress) are proven in pgTAP 101; here
// we check them through the pages, plus the neutral addresses and titles.

async function devotionalXp(userId: string): Promise<number> {
  const { data } = await admin().from("xp_ledger").select("points").eq("user_id", userId).eq("reason", "devotional");
  return (data ?? []).reduce((sum, row) => sum + row.points, 0);
}

test.describe("daily reading", () => {
  test.use({ storageState: signedOut });
  test.describe.configure({ timeout: 120_000 });

  test("the verse of the day, starting a plan and reading a day", async ({ page }) => {
    const me = await signInNewMember(page, "reading-start");
    await page.goto("/me");
    await page.getByRole("link", { name: /Daily reading/ }).click();
    await expect(page).toHaveURL(/\/reading$/);
    await expect(page).toHaveTitle(/^Daily reading \| /);
    await expect(page.getByRole("heading", { name: "Verse for today" })).toBeVisible();
    await expect(page.locator(".reading-verse figcaption")).toContainText("(WEB)");

    // No plan yet: three to choose from, and nothing about falling behind.
    await expect(page.getByRole("heading", { name: "Choose a plan" })).toBeVisible();
    await expect(page.getByText(/behind|missed|overdue/i)).toHaveCount(1); // "you can never fall behind"
    await page.getByRole("button", { name: "Start this plan: Free in Christ" }).click();
    await expect(page).toHaveURL(/\/reading$/);
    await expect(page.locator("main .auth-banner")).toContainText("Your plan is ready");
    await expect(page.locator("main .auth-banner")).toBeFocused();

    const plan = page.getByRole("region", { name: "Free in Christ" });
    await expect(plan.getByText("Day 1 of 7")).toBeVisible();
    await expect(plan.getByRole("heading", { name: "Romans 6" })).toBeVisible();
    await plan.getByRole("button", { name: "Mark day 1 as read" }).click();
    await expect(page).toHaveURL(/\/reading$/);
    await expect(page.locator("main .auth-banner")).toContainText("Marked as read.");
    await expect(plan.getByText("Day 2 of 7")).toBeVisible();
    await expect(plan.getByRole("heading", { name: "Romans 8" })).toBeVisible();
    await expect(plan.getByText("1 of 7 days read")).toBeVisible();

    await expect.poll(() => devotionalXp(me.userId), { timeout: 30_000 }).toBe(5);
  });

  test("a plan day earns XP once, never twice, and never changes the level", async ({ page }) => {
    const me = await signInNewMember(page, "reading-once");
    await page.goto("/reading/30-days?day=3");
    await expect(page).toHaveTitle(/^Reading plan \| /);
    await expect(page.getByRole("heading", { name: "Day 3", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "John 3" })).toBeVisible();
    await page.getByRole("button", { name: "Mark day 3 as read" }).click();
    // Back to the very same address; the result is in the one-minute cookie (D-098).
    await expect(page).toHaveURL(/\/reading\/30-days\?day=3$/);
    await expect(page.getByText("You’ve read this day.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Day 3 John 3 Read/ })).toBeVisible();
    await expect.poll(() => devotionalXp(me.userId), { timeout: 30_000 }).toBe(5);

    // Unmark, read again, and switch plans back and forth: still +5 once.
    await page.getByRole("button", { name: "Mark as not read" }).click();
    await expect(page.locator("main .auth-banner")).toContainText("Marked as not read.");
    await page.getByRole("button", { name: "Mark day 3 as read" }).click();
    await expect(page.getByText("You’ve read this day.")).toBeVisible();
    await page.goto("/reading");
    await page.getByRole("button", { name: "Start this plan: The New Testament" }).click();
    await page.getByRole("button", { name: "Continue this plan: John, Ephesians and Philippians" }).click();
    await expect(page.getByText("Day 1 of 30")).toBeVisible();
    // Give the job queue time to run anything it was (wrongly) given.
    await page.waitForTimeout(8_000);
    expect(await devotionalXp(me.userId)).toBe(5);

    const { data: stats } = await admin()
      .from("user_stats")
      .select("level, level_progress_days, highest_level")
      .eq("user_id", me.userId)
      .maybeSingle();
    expect([stats?.level ?? 0, stats?.level_progress_days ?? 0, stats?.highest_level ?? 0]).toEqual([0, 0, 0]);
  });

  test("addresses carry only a neutral slug and a day number", async ({ page }) => {
    await signInNewMember(page, "reading-address");
    await page.goto("/reading/7-days");
    for (const link of await page.locator("a[href*='/reading']").all()) {
      expect(await link.getAttribute("href")).toMatch(/^\/reading(\/\d+-days(\?day=\d+)?)?$/);
    }
    // An unknown plan or day never shows anything else.
    expect((await page.goto("/reading/free-in-christ"))?.status()).toBe(404);
    await page.goto("/reading/7-days?day=99");
    await expect(page.getByRole("heading", { name: "Day 1", exact: true })).toBeVisible();
  });
});
