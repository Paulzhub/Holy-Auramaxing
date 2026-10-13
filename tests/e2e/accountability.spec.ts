import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 6b: nudges, accountability partners, asking for prayer from the slip
// page, and milestone cards (CLAUDE.md §7.7; D-082 to D-085). The rules are
// proven in pgTAP 081; here we check the pages by keyboard, and the "done
// when" item: nudge limits hold under rapid repeated requests.

const kolkata = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offset * 86_400_000));

async function name(member: { userId: string }, displayName: string) {
  const { error } = await admin().from("profiles").update({ display_name: displayName }).eq("id", member.userId);
  if (error) throw error;
}

async function at320(page: Page, label: string) {
  await page.setViewportSize({ width: 320, height: 720 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} at 320px`).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 800 });
}

test.describe("Nudges, partners and milestones", () => {
  test.use({ storageState: signedOut });
  test.describe.configure({ timeout: 150_000 });

  test("a nudge by keyboard; limits hold under rapid repeated requests", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "nudge-me"));
    await name(me, "Nia Nudger");
    const groupId = await createGroupAs(me, "Nudge Club");
    const { token } = await createInviteAs(me, groupId);
    const friend = await newMember("nudge-friend");
    await name(friend, "Finn Friend");
    await joinAs(friend, token);
    const other = await newMember("nudge-other");
    await name(other, "Ola Other");
    await joinAs(other, token);

    await page.goto(`/groups/${groupId}`);
    const row = page.locator(".group-today__row").filter({ hasText: "Finn Friend" });
    await row.locator("summary", { hasText: "Nudge Finn Friend" }).focus();
    await page.keyboard.press("Enter");
    await row.getByRole("button", { name: "Send “Praying for you” to Finn Friend" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Nudge sent.")).toBeVisible();
    await expect(
      page.locator(".group-today__row").filter({ hasText: "Finn Friend" }).getByText("Nudged today"),
    ).toBeVisible();
    await expectNoAxeViolations(page, "group home with nudges");
    await at320(page, "group home");

    // Twenty requests at once from Ola to Finn: exactly one gets through.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        other.client.rpc("send_nudge", {
          p_group: groupId,
          p_to: friend.userId,
          p_kind: i % 2 ? "got_this" : "check_in",
        }),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error?.message === "nudge_already_sent")).toHaveLength(19);
    const { data: kept } = await admin().from("nudges").select("id").eq("from_user", other.userId);
    expect(kept).toHaveLength(1);

    // Finn sees both nudges.
    const { data: mine } = await friend.client.rpc("my_nudges", { p_group: groupId });
    expect(mine).toHaveLength(2);

    // Finn mutes nudges in the group: the button goes, and the API refuses.
    const { error: muteError } = await friend.client.rpc("set_group_nudges_muted", { p_group: groupId, p_muted: true });
    expect(muteError).toBeNull();
    const { error: mutedError } = await me.client.rpc("send_nudge", {
      p_group: groupId,
      p_to: friend.userId,
      p_kind: "praying",
    });
    expect(mutedError?.message).toBe("nudges_muted");
    await page.goto(`/groups/${groupId}`);
    await expect(page.locator(".group-today__row").filter({ hasText: "Finn Friend" }).locator("summary")).toHaveCount(
      0,
    );
  });

  test("nudges received show on Home; muting from Settings", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "nudge-home"));
    const groupId = await createGroupAs(me, "Home Nudges");
    const { token } = await createInviteAs(me, groupId);
    const friend = await newMember("nudge-sender");
    await name(friend, "Sal Sender");
    await joinAs(friend, token);
    const { error } = await friend.client.rpc("send_nudge", { p_group: groupId, p_to: me.userId, p_kind: "call_me" });
    expect(error).toBeNull();

    await page.goto("/home");
    await expect(page.getByTestId("nudges-for-you")).toContainText("Sal Sender: Call me if you need");
    await expectNoAxeViolations(page, "home with nudges");

    await page.goto("/settings");
    await page.getByLabel("Don't take nudges in any group").check();
    await page.getByRole("button", { name: "Save nudge settings" }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Don't take nudges in any group")).toBeChecked();
    const { data: targets } = await friend.client.rpc("group_nudge_targets", { p_group: groupId });
    expect((targets as { user_id: string }[]).map((t) => t.user_id)).not.toContain(me.userId);
    await expectNoAxeViolations(page, "settings");
  });

  test("partners: ask, accept, see detail only in that group, alerts, end", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "partner-me"));
    await name(me, "Pat Partner");
    const groupId = await createGroupAs(me, "Partner Place");
    const { token } = await createInviteAs(me, groupId);
    const friend = await newMember("partner-friend");
    await name(friend, "Quin Quiet");
    await joinAs(friend, token, "checkin_only");
    await friend.client.rpc("submit_checkin", { p_local_date: kolkata(), p_outcome: "clean" });
    await admin()
      .from("checkins")
      .update({ mood: 4, triggers: ["tired"] })
      .eq("user_id", friend.userId);

    await page.goto(`/groups/${groupId}/partner`);
    await expect(page).toHaveTitle(/^Partner \|/);
    await expect(page.getByRole("link", { name: "Partner", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Who?").selectOption({ label: "Quin Quiet" });
    await page.getByRole("button", { name: "Ask to be partners" }).click();
    await expect(page.getByText("Asked. They'll see your request on this page.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Waiting for an answer" })).toBeVisible();

    // Before Quin accepts, Pat sees nothing private.
    const before = await me.client
      .from("group_checkins_today")
      .select("mood")
      .eq("group_id", groupId)
      .eq("user_id", friend.userId)
      .single();
    expect(before.data?.mood).toBeNull();

    const { data: requests } = await friend.client.rpc("my_partnerships", { p_group: groupId });
    const request = (requests as { id: string; asked_by_me: boolean }[])[0]!;
    expect(request.asked_by_me).toBe(false);
    expect(
      (await friend.client.rpc("respond_partner", { p_partnership: request.id, p_accept: true })).error,
    ).toBeNull();

    const after = await me.client
      .from("group_checkins_today")
      .select("mood, triggers")
      .eq("group_id", groupId)
      .eq("user_id", friend.userId)
      .single();
    expect(after.data).toEqual({ mood: 4, triggers: ["tired"] });

    await page.reload();
    const list = page.getByTestId("partner-list");
    await expect(list.getByText("Quin Quiet", { exact: true })).toBeVisible();
    await expect(list.getByText("Quin Quiet hasn't turned on alerts for you.")).toBeVisible();
    await expectNoAxeViolations(page, "partner page");
    await at320(page, "partner page");

    // My own alert choice, by keyboard.
    await list.getByLabel("Let Quin Quiet know if I miss two days or press SOS").focus();
    await page.keyboard.press("Space");
    await list.getByRole("button", { name: "Save alert choice" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    const { data: row } = await admin()
      .from("partnerships")
      .select("a_allows_alerts, b_allows_alerts")
      .eq("group_id", groupId)
      .single();
    expect(row).toEqual({ a_allows_alerts: true, b_allows_alerts: false });

    // Ending it.
    await page.getByTestId("partner-list").getByText("End the partnership").click();
    await page.getByRole("button", { name: "Yes, end it" }).click();
    await expect(page.getByText("The partnership has ended.")).toBeVisible();
    const ended = await me.client
      .from("group_checkins_today")
      .select("mood")
      .eq("group_id", groupId)
      .eq("user_id", friend.userId)
      .single();
    expect(ended.data?.mood).toBeNull();
  });

  test("the slip page asks the group or a partner to pray", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "prayer-me"));
    const groupId = await createGroupAs(me, "Prayer Circle");
    const { token } = await createInviteAs(me, groupId);
    const partner = await newMember("prayer-partner");
    await name(partner, "Abe Ally");
    await joinAs(partner, token);
    const { data: pid } = await me.client.rpc("request_partner", { p_group: groupId, p_user: partner.userId });
    await partner.client.rpc("respond_partner", { p_partnership: pid, p_accept: true });
    await me.client.rpc("submit_checkin", { p_local_date: kolkata(), p_outcome: "slipped" });

    await page.goto(`/check-in/done?date=${kolkata()}`);
    await expect(page.getByLabel("Your request")).toHaveValue("Please pray for me today.");
    await page.getByRole("button", { name: "Ask Abe Ally to pray" }).click();
    await expect(page.getByText("Your partner has been asked to pray for you.")).toBeVisible();
    const { data: theirs } = await partner.client.rpc("my_nudges", { p_group: groupId });
    expect((theirs as { kind: string }[]).map((n) => n.kind)).toEqual(["pray_for_me"]);
    // The address says nothing about the answer (D-055).
    expect(page.url()).not.toMatch(/slip|mercies/);

    await page.getByRole("button", { name: "Ask my group to pray" }).click();
    await expect(page.getByText("Your prayer request is on your group's wall.")).toBeVisible();
    await expectNoAxeViolations(page, "slip page with the prayer card");
    await at320(page, "slip page");
    await page.goto(`/groups/${groupId}/wall?kind=prayer_request`);
    await expect(page.locator(".wall-post__body").getByText("Please pray for me today.")).toBeVisible();
  });

  test("a milestone card reaches the group, and only where the streak is shared", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "milestone-viewer"));
    const groupId = await createGroupAs(me, "Milestones");
    const { token } = await createInviteAs(me, groupId);
    const runner = await newMember("milestone-runner");
    await name(runner, "Ray Runner");
    await joinAs(runner, token, "streak");
    const quiet = await newMember("milestone-quiet");
    await joinAs(quiet, token, "checkin_only");
    for (const m of [runner, quiet]) {
      await admin()
        .from("profiles")
        .update({ created_at: new Date(Date.now() - 10 * 86_400_000).toISOString() })
        .eq("id", m.userId);
      const rows = Array.from({ length: 7 }, (_, i) => ({
        user_id: m.userId,
        local_date: kolkata(-(i + 1)),
        timezone: "Asia/Kolkata",
        outcome: "clean",
      }));
      const { error } = await admin().from("checkins").insert(rows);
      if (error) throw error;
    }

    // The job queue awards the badge within about 10 seconds.
    await expect(async () => {
      await page.goto(`/groups/${groupId}/wall`);
      await expect(page.getByText("Ray Runner reached Sabbath Rest: 7 free days in a row.")).toBeVisible({
        timeout: 1_000,
      });
    }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
    const { count } = await admin()
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("kind", "milestone")
      .eq("author_id", quiet.userId);
    expect(count).toBe(0);

    const card = page.getByRole("article").filter({ hasText: "Ray Runner reached Sabbath Rest" });
    await card.getByRole("button", { name: /^On fire, no reactions yet/ }).click();
    await expect(card.getByRole("button", { name: /^On fire, 1 reaction, including yours/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectNoAxeViolations(page, "wall with a milestone card");
  });
});
