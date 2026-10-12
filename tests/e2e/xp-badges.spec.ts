import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 5b: XP, badges and the job queue (CLAUDE.md §7.6; D-070 to D-073).
// The rules themselves (idempotency, caps, reversals, kept badges) are in
// pgTAP 060–062; here we check the pages and that the worker really runs.

/** Test accounts live in Asia/Kolkata (support/supabase.ts). */
function kolkataDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

async function seedCleanRun(userId: string, from: number, to = 1) {
  const rows = [];
  for (let n = from; n >= to; n -= 1) {
    rows.push({ user_id: userId, local_date: kolkataDate(-n), timezone: "Asia/Kolkata", outcome: "clean" });
  }
  const { error } = await admin().from("checkins").insert(rows);
  if (error) throw error;
  const { error: e2 } = await admin()
    .from("profiles")
    .update({ created_at: new Date(Date.now() - (from + 2) * 86_400_000).toISOString() })
    .eq("id", userId);
  if (e2) throw e2;
}

/** The worker runs every 10 seconds: reload Progress until the XP shows. */
async function waitForXp(page: Page, xp: string) {
  await expect(async () => {
    await page.goto("/progress");
    await expect(page.getByTestId("xp-total")).toHaveText(xp, { timeout: 1_000 });
  }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
}

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(0);
}

test.describe("XP and badges", () => {
  test.use({ storageState: signedOut });
  // The worker settles XP every 10 seconds, so these wait a little longer.
  test.describe.configure({ timeout: 120_000 });

  test("Level 0 shows the share card's preview on Progress, and an honest slip earns check-in XP", async ({ page }) => {
    await signInNewMember(page, "xp-slip");

    await page.goto("/progress");
    const card = page.getByRole("region", { name: "Clay" });
    const preview = card.getByTestId("share-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("alt", /Clay/);
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(card.getByRole("link", { name: "Save a picture of your level" })).toBeVisible();
    await expect(page.getByTestId("xp-total")).toHaveText("0 XP");
    await expect(page.getByText("Your first badge comes with your first free day.")).toBeVisible();

    // Home keeps only the link (no preview), plus the XP line.
    await page.goto("/home");
    await expect(page.getByTestId("share-preview")).toHaveCount(0);
    await expect(page.getByTestId("xp-line")).toHaveText("0 XP");

    // An honest slip: +10 for the check-in and +2 for day 1 of checking in.
    await page.goto("/check-in");
    await page.getByRole("button", { name: "I slipped" }).click();
    await expect(page).toHaveURL(/\/check-in\/done\?date=/);
    await waitForXp(page, "12 XP");
    await expect(page.getByTestId("badge-list")).toHaveCount(0);
    await expectNoAxeViolations(page, "progress with XP");
  });

  test("a week of check-ins earns badges, shown on Progress and kept", async ({ page }) => {
    const me = await signInNewMember(page, "xp-week");
    await seedCleanRun(me.userId, 6);
    await page.goto("/check-in");
    await page.getByRole("button", { name: "I stayed free today" }).click();
    await expect(page).toHaveURL(/\/check-in\/done\?date=/);

    // 7 × 10 + (2 + 4 + 6 + 8 + 10 + 12 + 14).
    await waitForXp(page, "126 XP");
    const list = page.getByTestId("badge-list");
    for (const name of ["First Step", "Third Day", "Sabbath Rest", "Faithful in Little"]) {
      await expect(list.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(list.getByText("New", { exact: true }).first()).toBeVisible();
    await expect(list).toContainText("Genesis 2:2 (WEB)");
    await expect(page.getByRole("region", { name: "Your XP" })).toContainText("Two Weeks Standing");
    await expectNoAxeViolations(page, "progress with badges");
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page, "progress at 320px");
    await page.goto("/home");
    await expect(page.getByTestId("xp-line")).toHaveText("126 XP");
    await noOverflow(page, "home at 320px");

    // An honest slip today afterwards: same XP, and every badge stays.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/check-in");
    await page.getByText("Change your answer").click();
    await page.getByRole("button", { name: "I slipped" }).click();
    await expect(page).toHaveURL(/\/check-in\/done\?date=/);
    await page.waitForTimeout(12_000);
    await waitForXp(page, "126 XP");
    await expect(page.getByTestId("badge-list").getByText("Sabbath Rest", { exact: true })).toBeVisible();
  });

  test("a group sees badges only from members who share their streak there", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "badges-group-owner"));
    const groupId = await createGroupAs(owner, "Badge Watch");
    const { token } = await createInviteAs(owner, groupId);
    const quiet = await newMember("badges-quiet");
    const shown = await newMember("badges-shown");
    await joinAs(quiet, token, "checkin_only");
    await joinAs(shown, token, "streak");
    for (const [m, name] of [
      [quiet, "Quiet Badger"],
      [shown, "Shown Badger"],
    ] as const) {
      const { error } = await admin().from("profiles").update({ display_name: name }).eq("id", m.userId);
      if (error) throw error;
      await seedCleanRun(m.userId, 3);
    }

    await expect(async () => {
      await page.goto(`/groups/${groupId}/members`);
      const rows = page.getByTestId("member-list").getByRole("listitem");
      await expect(rows.filter({ hasText: "Shown Badger" }).getByRole("list", { name: "Badges" })).toContainText(
        "Third Day",
        { timeout: 1_000 },
      );
    }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
    const rows = page.getByTestId("member-list").getByRole("listitem");
    await expect(rows.filter({ hasText: "Quiet Badger" }).getByRole("list", { name: "Badges" })).toHaveCount(0);
    await expectNoAxeViolations(page, "members with badges");
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page, "members at 320px");
  });
});
