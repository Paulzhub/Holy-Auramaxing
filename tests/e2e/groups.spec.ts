import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, setTheme, signedOut, test, themes } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 3: groups, roles and the switcher (CLAUDE.md §7.4).

async function createGroupThroughWizard(page: Page, name: string, opts: { minLevel?: string } = {}) {
  await page.goto("/groups/new");
  await page.getByLabel("Group name").fill(name);
  await page.getByLabel("Description (optional)").fill("Iron sharpens iron.");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "The challenge" })).toBeFocused();
  await page.getByLabel("Challenge length").selectOption("custom");
  await page.getByLabel("Number of days").fill("21");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Who can join" })).toBeVisible();
  await page.getByLabel("Most members").fill("12");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "The covenant" })).toBeVisible();
  if (opts.minLevel) {
    await page.getByRole("group", { name: "What everyone shares at least" }).getByLabel(opts.minLevel).check();
  }
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Check and start" })).toBeVisible();
  await page.getByRole("button", { name: "Start the group" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}\?notice=created$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return /\/groups\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

function switcher(page: Page) {
  return page.locator(".group-switcher:visible");
}

test.describe("Groups", () => {
  test.use({ storageState: signedOut });

  test("one person creates two groups, belongs to three, and switches between them", async ({ page }) => {
    const { userId } = await signInNewMember(page, "groups-three");

    // Nothing yet: a kind empty state with both ways in.
    await page.goto("/groups");
    await expect(page.getByRole("heading", { name: "No groups yet" })).toBeVisible();

    const first = await createGroupThroughWizard(page, "Morning Light");
    await expect(page.getByText("Your group is ready.")).toBeVisible();
    await expect(page.getByText("Day 1 of 21")).toBeVisible();
    const second = await createGroupThroughWizard(page, "Evening Watch", { minLevel: "Streak" });

    // A third group, someone else's, joined with an invite link.
    const friend = await newMember("groups-friend");
    const third = await createGroupAs(friend, "Brothers in Arms");
    const { token } = await createInviteAs(friend, third);
    await page.goto(`/join/${token}`);
    await expect(page).toHaveURL(/\/join$/);
    await page.getByLabel("I accept this covenant").check();
    await page.getByRole("button", { name: "Join the group" }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${third}\\?notice=joined$`));

    // All three, in the list and in the switcher.
    await page.goto("/groups");
    for (const name of ["Morning Light", "Evening Watch", "Brothers in Arms"]) {
      await expect(page.getByRole("link", { name })).toBeVisible();
    }
    for (const [id, name] of [
      [first, "Morning Light"],
      [second, "Evening Watch"],
      [third, "Brothers in Arms"],
    ] as const) {
      await switcher(page).locator("summary").click();
      await switcher(page).getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`/groups/${id}$`));
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      // The switcher closed itself and now shows the current group.
      await expect(switcher(page).locator("summary")).toContainText(name);
      await switcher(page).locator("summary").click();
      await expect(switcher(page).getByRole("link", { name })).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      await expect(switcher(page).getByRole("link", { name })).toBeHidden();
    }

    // The database agrees: two owned, one joined.
    const { data } = await admin().from("group_members").select("role").eq("user_id", userId).eq("status", "active");
    expect(data?.map((r) => r.role).sort()).toEqual(["member", "owner", "owner"]);
  });

  test("the wizard explains what needs fixing and opens that step", async ({ page }) => {
    await signInNewMember(page, "groups-wizard");
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill("x");
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Start the group" }).click();
    const summary = page.getByRole("alert").filter({ hasText: "Please check this" });
    await expect(summary).toBeFocused();
    await expect(page.getByRole("heading", { name: "About the group" })).toBeVisible();
    await expect(page.getByLabel("Group name")).toHaveAttribute("aria-invalid", "true");
  });

  test("owners promote, demote, hand over and remove; members leave", async ({ page }) => {
    const owner = await signInNewMember(page, "roles-owner");
    const ownerMember = await apiAs(owner);
    const groupId = await createGroupAs(ownerMember, "Iron Sharpens");
    const { token } = await createInviteAs(ownerMember, groupId);
    const alice = await newMember("roles-alice");
    const bob = await newMember("roles-bob");
    await admin().from("profiles").update({ display_name: "Alice" }).eq("id", alice.userId);
    await admin().from("profiles").update({ display_name: "Bob" }).eq("id", bob.userId);
    await joinAs(alice, token);
    await joinAs(bob, token);

    await page.goto(`/groups/${groupId}/members`);
    const list = page.getByTestId("member-list");
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await list.getByRole("group", { name: "Actions for Alice" }).getByRole("button", { name: "Make admin" }).click();
    await expect(page.getByText("Role changed.")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: "Alice" })).toContainText("Admin");

    // Remove Bob, with a second, explicit confirmation.
    const bobActions = list.getByRole("group", { name: "Actions for Bob" });
    await bobActions.getByText("Remove", { exact: true }).click();
    await bobActions.getByRole("button", { name: "Yes, remove" }).click();
    await expect(page.getByText("Removed from the group.")).toBeVisible();
    await expect(page.getByTestId("member-list").getByRole("listitem")).toHaveCount(2);

    // The audit log has the role change and the removal, with ids only.
    const { data: events } = await admin()
      .from("audit_log")
      .select("action, target_id, metadata")
      .in("action", ["group.role_changed", "group.member_removed"])
      .eq("metadata->>group", groupId);
    expect(events?.map((e) => e.action).sort()).toEqual(["group.member_removed", "group.role_changed"]);

    // Hand the group to Alice: the owner becomes an admin.
    await page.goto(`/groups/${groupId}/settings`);
    await page.getByLabel("New owner").selectOption({ label: "Alice" });
    await page.getByRole("button", { name: "Hand over" }).click();
    await expect(page.getByText("You handed the group over. You're now an admin.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hand over, archive or delete" })).toHaveCount(0);

    // Now an admin, the former owner can leave.
    await page.getByText("Leave group", { exact: true }).click();
    await page.getByRole("button", { name: "Yes, leave" }).click();
    await expect(page).toHaveURL(/\/groups\?notice=left$/);
    await expect(page.getByText("You left the group.")).toBeVisible();
    const { count } = await admin()
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("user_id", owner.userId);
    expect(count).toBe(0);
  });

  test("the owner archives, brings back and deletes a group", async ({ page }) => {
    await signInNewMember(page, "lifecycle");
    const groupId = await createGroupThroughWizard(page, "Short Season");

    await page.goto(`/groups/${groupId}/settings`);
    await page.getByRole("button", { name: "Archive the group" }).click();
    await expect(page.getByText("The group is archived.")).toBeVisible();
    await page.goto(`/groups/${groupId}`);
    await expect(page.getByText("This group is archived.")).toBeVisible();
    await page.goto(`/groups/${groupId}/settings`);
    await page.getByRole("button", { name: "Bring the group back" }).click();
    await expect(page.getByText("The group is back.")).toBeVisible();

    await page.getByLabel("Type the group's name to confirm").fill("Wrong name");
    await page.getByRole("button", { name: "Delete the group" }).click();
    await expect(page.getByText("Type the group's name exactly to confirm.").first()).toBeVisible();
    await page.getByLabel("Type the group's name to confirm").fill("short season");
    await page.getByRole("button", { name: "Delete the group" }).click();
    await expect(page).toHaveURL(/\/groups\?notice=deleted$/);
    expect((await admin().from("groups").select("id").eq("id", groupId)).data).toEqual([]);
  });

  test("tightening the covenant waits for every member to agree", async ({ page }) => {
    const owner = await newMember("covenant-owner");
    const groupId = await createGroupAs(owner, "Steady Steps");
    const { token } = await createInviteAs(owner, groupId);
    const member = await apiAs(await signInNewMember(page, "covenant-member"));
    await joinAs(member, token);

    const { data: outcome } = await owner.client.rpc("change_group_covenant", {
      p_group: groupId,
      p_covenant_text: "We walk together in grace and honesty.",
      p_min_share_level: "streak",
      p_leaderboard_hiding_allowed: false,
    });
    expect(outcome).toBe("proposed");

    await page.goto(`/groups/${groupId}`);
    await expect(page.getByRole("heading", { name: "A change to the covenant" })).toBeVisible();
    await expect(page.getByText("0 of 1 members have agreed.")).toBeVisible();
    await page.getByRole("button", { name: "I agree" }).click();
    await expect(page.getByText("Everyone agreed: the new covenant applies.")).toBeVisible();
    await expect(page.getByText("Everyone shares at least: Streak")).toBeVisible();
    await expect(page.getByText("Everyone appears on the leaderboard.")).toBeVisible();
  });

  test("members change what they share, never below the minimum", async ({ page }) => {
    const owner = await newMember("share-owner");
    const groupId = await createGroupAs(owner, "Share Well", { minShareLevel: "streak", hiding: false });
    const { token } = await createInviteAs(owner, groupId);
    const me = await apiAs(await signInNewMember(page, "share-member"));
    await joinAs(me, token);

    await page.goto(`/groups/${groupId}/settings`);
    const choice = page.getByRole("group", { name: "What you share with this group" });
    await expect(choice.getByRole("radio")).toHaveCount(2); // Streak and Full: never "Checked in"
    await expect(page.getByLabel("Hide me from this group's leaderboard")).toHaveCount(0);
    await choice.getByLabel("Streak").check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    const { data } = await admin()
      .from("group_members")
      .select("share_level")
      .eq("group_id", groupId)
      .eq("user_id", me.userId)
      .single();
    expect(data?.share_level).toBe("streak");
  });

  test("the data export includes my groups, and nobody else's details", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "groups-export"));
    const groupId = await createGroupAs(me, "Exported Group");
    const { token } = await createInviteAs(me, groupId);
    const other = await newMember("groups-export-other");
    await admin().from("profiles").update({ display_name: "Someone Else" }).eq("id", other.userId);
    await joinAs(other, token);

    await page.goto("/settings/data");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    const download = await downloadPromise;
    const { readZip } = await import("../../src/lib/zip");
    const { readFile } = await import("node:fs/promises");
    const entries = new Map(
      readZip(new Uint8Array(await readFile((await download.path())!))).map((e) => [
        e.path,
        new TextDecoder("utf-8", { ignoreBOM: true }).decode(e.data),
      ]),
    );
    expect(entries.get("csv/group_memberships.csv")).toContain("Exported Group");
    expect(entries.get("csv/groups_owned.csv")).toContain("We walk together in grace and honesty.");
    expect(entries.get("csv/group_invites_made.csv")).toBeTruthy();
    const everything = [...entries.values()].join("\n");
    expect(everything).not.toContain("Someone Else");
    expect(everything).not.toContain(other.userId);
    expect(everything).not.toContain(token);
  });
});

test.describe("Group pages are accessible", () => {
  test.use({ storageState: signedOut });

  for (const theme of themes) {
    test(`no axe violations on the group pages (${theme})`, async ({ page, context, baseURL }) => {
      await setTheme(context, baseURL!, theme);
      const me = await apiAs(await signInNewMember(page, `groups-a11y-${theme}`));
      const groupId = await createGroupAs(me, "Quiet Waters");
      const other = await newMember(`groups-a11y-other-${theme}`);
      const { token } = await createInviteAs(me, groupId);
      await joinAs(other, token);

      for (const path of [
        "/groups",
        "/groups/new",
        `/groups/${groupId}`,
        `/groups/${groupId}/members`,
        `/groups/${groupId}/invites`,
        `/groups/${groupId}/settings`,
        "/join",
      ]) {
        await page.goto(path);
        await expectNoAxeViolations(page, `${path} (${theme})`);
      }

      // The invite panel (link, code and QR) after making an invite.
      await page.goto(`/groups/${groupId}/invites`);
      await page.getByRole("button", { name: "Make an invite" }).click();
      await expect(page.getByRole("heading", { name: "Your invite is ready" })).toBeVisible();
      await expectNoAxeViolations(page, `invite panel (${theme})`);

      // The switcher, open.
      await switcher(page).locator("summary").click();
      await expectNoAxeViolations(page, `switcher (${theme})`);
    });
  }
});

test.describe("Group pages on small screens", () => {
  test.use({ storageState: signedOut, viewport: { width: 320, height: 640 } });

  test("reflow at 320px with no sideways scrolling, switcher open or closed", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "groups-320"));
    const groupId = await createGroupAs(me, "A Rather Long Group Name For Small Screens");
    const other = await newMember("groups-320-other");
    const { token } = await createInviteAs(me, groupId);
    await joinAs(other, token);
    for (const path of [
      "/groups",
      "/groups/new",
      `/groups/${groupId}`,
      `/groups/${groupId}/members`,
      `/groups/${groupId}/invites`,
      `/groups/${groupId}/settings`,
      "/join",
    ]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.goto(`/groups/${groupId}/invites`);
    await page.getByRole("button", { name: "Make an invite" }).click();
    await expect(page.getByRole("heading", { name: "Your invite is ready" })).toBeVisible();
    await switcher(page).locator("summary").click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
