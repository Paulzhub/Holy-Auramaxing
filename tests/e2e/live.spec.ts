import { expect } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 6c: live updates on the group page through Supabase Realtime, and
// reactions on check-ins (CLAUDE.md §7.7; D-086, D-087). The channel and its
// pings are proven in pgTAP 082; here a second person's actions reach an open
// page without a reload, and the wall waits for the reader to ask.

const kolkataToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

async function name(member: { userId: string }, displayName: string) {
  const { error } = await admin().from("profiles").update({ display_name: displayName }).eq("id", member.userId);
  if (error) throw error;
}

test.describe("Live updates", () => {
  test.use({ storageState: signedOut });
  test.describe.configure({ timeout: 120_000 });

  test("a new post shows a button on an open wall; Today updates on its own", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "live-me"));
    const groupId = await createGroupAs(me, "Live Wire");
    const { token } = await createInviteAs(me, groupId);
    const friend = await newMember("live-friend");
    await name(friend, "Lee Live");
    await joinAs(friend, token);

    // ---- the wall: a ping, then a button; nothing moves until it's pressed.
    await page.goto(`/groups/${groupId}/wall`);
    // Let the Realtime client load and join after the page is idle.
    await page.waitForTimeout(4_000);
    const { error } = await friend.client.rpc("create_post", {
      p_group: groupId,
      p_kind: "encouragement",
      p_body: "Hello from the other side of the group.",
    });
    expect(error).toBeNull();
    const show = page.getByRole("button", { name: "Show it" });
    await expect(page.getByText("There's something new on the wall.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Hello from the other side of the group.")).toHaveCount(0);
    await expectNoAxeViolations(page, "wall with the new-posts notice");
    await show.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".wall-post__body").getByText("Hello from the other side of the group.")).toBeVisible();

    // ---- the home: Lee checks in, and the Today panel updates by itself.
    await page.goto(`/groups/${groupId}`);
    const row = page.locator(".group-today__row").filter({ hasText: "Lee Live" });
    await expect(row.getByText("Not yet")).toBeVisible();
    await page.waitForTimeout(4_000);
    await friend.client.rpc("submit_checkin", { p_local_date: kolkataToday(), p_outcome: "clean" });
    await expect(row.getByText("Checked in", { exact: true })).toBeVisible({ timeout: 20_000 });

    // ---- reacting to Lee's check-in, by keyboard.
    const withYou = row.getByRole("button", { name: /^With you, no reactions yet/ });
    await withYou.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .locator(".group-today__row")
        .filter({ hasText: "Lee Live" })
        .getByRole("button", { name: /^With you, 1 reaction, including yours/ }),
    ).toHaveAttribute("aria-pressed", "true");
    const { data: seen } = await friend.client.rpc("group_checkin_reactions", { p_group: groupId });
    expect((seen as { reactions: Record<string, number> }[])[0]?.reactions).toEqual({ strong: 1 });
    await expectNoAxeViolations(page, "group home with reactions on check-ins");
  });

  test("nothing personal travels over the channel, and only members get its name", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "live-topic"));
    const groupId = await createGroupAs(me, "Quiet Channel");
    const outsider = await newMember("live-outsider");
    const { data: topic } = await me.client.rpc("group_live_topic", { p_group: groupId });
    expect(topic).toMatch(/^group:[0-9a-f]{40}$/);
    const { error } = await outsider.client.rpc("group_live_topic", { p_group: groupId });
    expect(error?.code).toBe("42501");
    // The page carries the name, not the group's id in the channel.
    await page.goto(`/groups/${groupId}`);
    expect(topic).not.toContain(groupId.replace(/-/g, ""));
  });
});
