import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember, type Member } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 5c: leaderboards, the Together total and the group goal (CLAUDE.md
// §7.6; D-074, D-075). The rules (ties, hiding only when the covenant allows
// it, live levels, this week) are proven in pgTAP 070 and 071; here we check
// the pages, and that a checkin_only member never shows where a slip could.

/** Test accounts live in Asia/Kolkata (support/supabase.ts). */
function kolkataDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

async function name(member: { userId: string }, displayName: string) {
  const { error } = await admin().from("profiles").update({ display_name: displayName }).eq("id", member.userId);
  if (error) throw error;
}

/** Free days before today (seeded), then today's answer through the real function. */
async function checkIn(member: Member, outcome: "clean" | "slipped", daysBefore = 0) {
  if (daysBefore > 0) {
    const rows = [];
    for (let n = daysBefore; n >= 1; n -= 1) {
      rows.push({ user_id: member.userId, local_date: kolkataDate(-n), timezone: "Asia/Kolkata", outcome: "clean" });
    }
    const { error } = await admin().from("checkins").insert(rows);
    if (error) throw error;
    await admin()
      .from("profiles")
      .update({ created_at: new Date(Date.now() - (daysBefore + 2) * 86_400_000).toISOString() })
      .eq("id", member.userId);
  }
  const { error } = await member.client.rpc("submit_checkin", { p_local_date: kolkataDate(), p_outcome: outcome });
  if (error) throw error;
}

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(0);
}

test.describe("Leaderboards, Together and the group goal", () => {
  test.use({ storageState: signedOut });
  // The worker refreshes boards every 10 seconds.
  test.describe.configure({ timeout: 150_000 });

  test("boards respect share levels and hiding; Together counts only streak or full", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "lb-owner"));
    await name(owner, "Olive Owner");
    const groupId = await createGroupAs(owner, "Board Walk", { hiding: true });
    const { token } = await createInviteAs(owner, groupId);

    const quiet = await newMember("lb-quiet");
    const streaky = await newMember("lb-streaky");
    const hidden = await newMember("lb-hidden");
    await name(quiet, "Quinn Quiet");
    await name(streaky, "Sam Streak");
    await name(hidden, "Hana Hidden");
    await joinAs(quiet, token, "checkin_only");
    await joinAs(streaky, token, "streak");
    await joinAs(hidden, token, "full");
    const { error: hideError } = await hidden.client.rpc("update_my_group_membership", {
      p_group: groupId,
      p_share_level: "full",
      p_leaderboard_hidden: true,
    });
    expect(hideError).toBeNull();

    // Quinn (checkin_only) has the most free days, so would top every board.
    await checkIn(quiet, "clean", 5);
    await checkIn(streaky, "clean", 2);
    await checkIn(hidden, "clean");

    // ---- the Current streak board: Sam (3), Hana hidden (the owner sees her name,
    // marked "Hidden from members", D-088), never Quinn.
    const board = page.getByTestId("leaderboard");
    await expect(async () => {
      await page.goto(`/groups/${groupId}/leaderboard?board=3`);
      await expect(board.getByText("Sam Streak")).toBeVisible({ timeout: 1_000 });
      await expect(board.getByText("3 days")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
    await expect(page.getByText("Quinn Quiet")).toHaveCount(0);
    await expect(board.getByRole("listitem").filter({ hasText: "Hana Hidden" })).toContainText("Hidden from members");
    await expect(board.getByText("Hidden member")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Current streak" })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(/^Leaderboard \|/);
    for (const tab of ["2", "4"]) {
      await page.goto(`/groups/${groupId}/leaderboard?board=${tab}`);
      await expect(board).toBeVisible();
      await expect(page.getByText("Quinn Quiet"), tab).toHaveCount(0);
    }
    await page.goto(`/groups/${groupId}/leaderboard?board=4&period=week`);
    await expect(page.getByText("Quinn Quiet")).toHaveCount(0);

    // ---- Consistency XP and Encourager: everyone, Quinn included.
    await expect(async () => {
      await page.goto(`/groups/${groupId}/leaderboard`);
      await expect(board.getByText("Quinn Quiet")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000, intervals: [2_000, 3_000] });
    await expect(board.getByText("Hidden from members")).toHaveCount(1);
    await page.goto(`/groups/${groupId}/leaderboard?board=5`);
    await expect(board.getByText("Quinn Quiet")).toBeVisible();
    await expectNoAxeViolations(page, "leaderboard");
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page, "leaderboard at 320px");
    await page.setViewportSize({ width: 1280, height: 800 });

    // ---- the API, directly: Quinn isn't on the streak board even for themselves;
    // the owner gets Hana's id (still marked hidden), members never do (D-088).
    const { data: quietStreak } = await quiet.client.rpc("group_leaderboard", { p_group: groupId, p_board: "streak" });
    expect((quietStreak ?? []).some((r: { is_me: boolean }) => r.is_me)).toBe(false);
    type Row = { member_id: string | null; is_hidden: boolean };
    const { data: ownerXp } = await owner.client.rpc("group_leaderboard", { p_group: groupId, p_board: "xp" });
    expect((ownerXp ?? []).find((r: Row) => r.member_id === hidden.userId)?.is_hidden).toBe(true);
    for (const member of [quiet, streaky]) {
      const { data: memberXp } = await member.client.rpc("group_leaderboard", { p_group: groupId, p_board: "xp" });
      const ids = (memberXp ?? []).map((r: Row) => r.member_id);
      expect(ids).not.toContain(hidden.userId);
      expect(ids).toContain(null);
    }
    // A block either way hides her name from the owner too.
    expect((await hidden.client.rpc("block_member", { p_user: owner.userId })).error).toBeNull();
    const { data: blockedXp } = await owner.client.rpc("group_leaderboard", { p_group: groupId, p_board: "xp" });
    expect((blockedXp ?? []).map((r: Row) => r.member_id)).not.toContain(hidden.userId);
    expect((await hidden.client.rpc("unblock_member", { p_user: owner.userId })).error).toBeNull();

    // ---- Together: Sam's 1 and Hana's 1 free day this challenge; never Quinn's.
    await page.goto(`/groups/${groupId}`);
    await expect(page.getByTestId("together-total")).toHaveText("2 free days together");
    await expect(page.getByText("Counted from 3 of 4 members")).toBeVisible();
    await expect(page.getByTestId("leaderboard-preview")).toBeVisible();

    // ---- the goal: the owner sets "100 free days every month".
    await page.getByText("Set a goal").click();
    await page.getByLabel("Free days together").fill("100");
    await page.getByLabel("Every").selectOption("month");
    await page.getByRole("button", { name: "Save the goal" }).click();
    await expect(page.getByText("The goal is saved.")).toBeVisible();
    await expect(async () => {
      await page.goto(`/groups/${groupId}`);
      await expect(page.getByTestId("goal-progress")).toHaveText("2 of 100 free days this month", { timeout: 1_000 });
    }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
    await expectNoAxeViolations(page, "group home with the goal");
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page, "group home at 320px");

    // Quinn's slip today doesn't move the total either.
    const { error: slipError } = await quiet.client.rpc("submit_checkin", {
      p_local_date: kolkataDate(),
      p_outcome: "slipped",
    });
    expect(slipError).toBeNull();
    await page.waitForTimeout(12_000);
    await page.goto(`/groups/${groupId}`);
    await expect(page.getByTestId("together-total")).toHaveText("2 free days together");

    // A member can't set the goal, through the API either.
    const { error: goalError } = await quiet.client.rpc("set_group_goal", {
      p_group: groupId,
      p_period: "week",
      p_target: 5,
    });
    expect(goalError?.code).toBe("42501");
  });
});
