import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 7b: the bell, live updates, the notification centre and settings
// (CLAUDE.md §7.8; D-089, D-090). Who gets what, folding, quiet hours,
// digest, snooze and the scheduler are proven in pgTAP 090 and 091; here we
// check the pages, the live toast, and that everything works by keyboard,
// passes axe and reflows at 320 px.

async function name(member: { userId: string }, displayName: string) {
  const { error } = await admin().from("profiles").update({ display_name: displayName }).eq("id", member.userId);
  if (error) throw error;
}

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(0);
}

test.describe("Notifications", () => {
  test.use({ storageState: signedOut });
  // The notify worker runs every 5 seconds.
  test.describe.configure({ timeout: 150_000 });

  test("the bell counts, a live toast arrives, and the centre opens and marks read", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "nt-owner"));
    await name(owner, "Olive Owner");
    const groupId = await createGroupAs(owner, "Morning Light");
    const { token } = await createInviteAs(owner, groupId);
    const friend = await newMember("nt-friend");
    await name(friend, "Sam Friend");

    // Someone joins: owners and admins hear (owner, 2026-10-13).
    await joinAs(friend, token, "full");
    const badge = page.getByTestId("unread-badge").first();
    await expect(async () => {
      await page.goto("/home");
      await expect(badge).toHaveText(/^1/, { timeout: 1_000 });
    }).toPass({ timeout: 45_000, intervals: [2_000, 3_000] });

    // Live: a nudge while the page is open shows a toast without reloading.
    const { error: nudgeError } = await friend.client.rpc("send_nudge", {
      p_group: groupId,
      p_to: owner.userId,
      p_kind: "praying",
    });
    expect(nudgeError).toBeNull();
    await expect(
      page.getByRole("region", { name: "Notifications" }).getByText("You have a new notification"),
    ).toBeVisible({
      timeout: 45_000,
    });
    await expect(badge).toHaveText(/^2/);

    // The group switcher (in the top bar and the sidebar) shows the group's unread count.
    await page.goto(`/groups/${groupId}`);
    await expect(page.locator(".group-switcher__summary .needs-answer-dot").first()).toBeAttached();
    await expect(page.locator(".group-switcher__list .unread-pill").first()).toContainText("2 unread");

    // The centre.
    await page.goto("/alerts");
    const list = page.getByTestId("alerts-list");
    await expect(list.getByText("Sam Friend sent you “Praying for you”")).toBeVisible();
    await expect(list.getByText("Sam Friend joined the group")).toBeVisible();
    await expect(list.getByText("In Morning Light").first()).toBeVisible();
    await expectNoAxeViolations(page, "alerts");
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page, "alerts at 320px");
    await page.setViewportSize({ width: 1280, height: 800 });

    // Opening one marks it read and goes where it leads.
    await list.getByRole("link", { name: /joined the group/ }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/members$`));
    await page.goto("/alerts");
    await expect(page.getByRole("button", { name: /^Mark as read: Sam Friend joined/ })).toHaveCount(0);
    await expect(badge).toHaveText(/^1/);

    // Mark all as read, by keyboard.
    await page.getByRole("button", { name: "Mark all as read" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("All caught up.")).toBeVisible();
    await expect(page.getByTestId("unread-badge")).toHaveCount(0);

    // Nobody else can read them, even straight through the API.
    const { data: theirs } = await friend.client.from("notifications").select("id").eq("user_id", owner.userId);
    expect(theirs ?? []).toHaveLength(0);
  });

  test("settings: the grid, timing, snooze and muting a group", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "nt-settings"));
    await createGroupAs(me, "Evening Watch");

    await page.goto("/settings");
    await page.getByRole("link", { name: "Notification settings" }).click();
    await expect(page).toHaveTitle(/^Notifications \|/);
    await expect(page.getByText("Always on, for your safety")).toBeVisible();

    // The grid: push off for Nudges, email on for Announcements.
    const pushNudges = page.getByRole("checkbox", { name: "Push Nudges", exact: true });
    const emailAnnouncements = page.getByRole("checkbox", { name: "Email Announcements", exact: true });
    await expect(pushNudges).toBeChecked();
    await expect(emailAnnouncements).not.toBeChecked();
    await pushNudges.uncheck();
    await emailAnnouncements.check();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect(pushNudges).not.toBeChecked();
    await expect(emailAnnouncements).toBeChecked();
    const { data: prefs } = await me.client.from("notification_preferences").select("type, channel, enabled");
    expect(prefs).toEqual(
      expect.arrayContaining([
        { type: "nudge", channel: "push", enabled: false },
        { type: "announcement", channel: "email", enabled: true },
      ]),
    );

    // Timing: a reminder, quiet hours and the daily digest.
    await page.getByLabel("Daily reminder time").fill("08:30");
    await page.getByLabel("Quiet hours start").fill("21:30");
    await page.getByLabel("Once a day, at 7 pm").check();
    await page.locator("#timing").locator("..").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect(page.getByLabel("Daily reminder time")).toHaveValue("08:30");
    await expect(page.getByLabel("Quiet hours start")).toHaveValue("21:30");
    await expect(page.getByLabel("Once a day, at 7 pm")).toBeChecked();

    // Snooze for a day, then wake up.
    await page.getByRole("button", { name: "Snooze for a day" }).click();
    await expect(page.getByText("Snoozed.")).toBeVisible();
    await expect(page.getByText(/^Snoozed until /)).toBeVisible();
    await page.getByRole("button", { name: "Wake up now" }).click();
    await expect(page.getByText("Snooze is off.")).toBeVisible();
    await expect(page.getByText(/^Snoozed until /)).toHaveCount(0);

    // Mute a group.
    await page.getByLabel("Mute Evening Watch").check();
    await page.locator("#groups").locator("..").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect(page.getByLabel("Mute Evening Watch")).toBeChecked();

    await expectNoAxeViolations(page, "notification settings");
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page, "notification settings at 320px");
  });
});
