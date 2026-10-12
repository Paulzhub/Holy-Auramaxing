import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Owner's request (2026-10-08), built in Phase 5c (D-076): an invite's own
// page for owners and admins. Another group's invite id is a 404, like an
// unknown one; members who aren't admins get a 404 too.

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(0);
}

test.describe("Invite details", () => {
  test.use({ storageState: signedOut });

  test("who made it, its uses and status, who joined; replace and stop", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "invdet-owner"));
    await admin().from("profiles").update({ display_name: "Ivy Inviter" }).eq("id", owner.userId);
    const groupId = await createGroupAs(owner, "Invite Detail", { joinPolicy: "request_to_join" });
    const { token, inviteId } = await createInviteAs(owner, groupId, { maxUses: 5 });
    const joiner = await newMember("invdet-joiner");
    await admin().from("profiles").update({ display_name: "Jo Joiner" }).eq("id", joiner.userId);
    await joinAs(joiner, token);

    // From the list to the invite's own page.
    await page.goto(`/groups/${groupId}/invites`);
    await page
      .getByTestId("invite-list")
      .getByRole("link", { name: /Working invite/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/invites/${inviteId}$`));
    await expect(page).toHaveTitle(/^Invites \|/);
    const facts = page.getByTestId("invite-facts");
    await expect(facts).toContainText("Working");
    await expect(facts).toContainText("Ivy Inviter");
    await expect(facts).toContainText("Used 1 of 5");
    const people = page.getByTestId("invite-people");
    await expect(people).toContainText("Jo Joiner");
    // The group asks admins to approve, so Jo is waiting.
    await expect(people).toContainText("Asked to join");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toMatch(/noindex/);
    await expectNoAxeViolations(page, "invite details");
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page, "invite details at 320px");
    await page.setViewportSize({ width: 1280, height: 800 });

    // Replace: the new link and code are shown once, here.
    await page.getByRole("button", { name: "Replace with a new one" }).click();
    await expect(page.getByTestId("invite-link")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("invite-facts")).toContainText("Stopped");

    // Stop another one from its own page.
    const { inviteId: second } = await createInviteAs(owner, groupId);
    await page.goto(`/groups/${groupId}/invites/${second}`);
    await page.getByText("Stop this invite").first().click();
    await page.getByRole("button", { name: "Stop this invite" }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/invites/${second}\\?notice=inviteRevoked`));
    await expect(page.getByTestId("invite-facts")).toContainText("Stopped");
    await expect(page.getByText("Nobody has used this invite yet.")).toBeVisible();
  });

  test("another group's invite id is a 404; members who aren't admins can't read invite details", async ({ page }) => {
    const bOwner = await newMember("invdet-b-owner");
    const groupB = await createGroupAs(bOwner, "Invite B");
    const { inviteId: inviteB } = await createInviteAs(bOwner, groupB);

    const me = await apiAs(await signInNewMember(page, "invdet-a-owner"));
    const groupA = await createGroupAs(me, "Invite A");
    const { token: tokenA, inviteId: inviteA } = await createInviteAs(me, groupA);

    expect((await page.goto(`/groups/${groupA}/invites/${inviteA}`))?.status()).toBe(200);
    expect((await page.goto(`/groups/${groupA}/invites/${inviteB}`))?.status()).toBe(404);
    expect((await page.goto(`/groups/${groupB}/invites/${inviteB}`))?.status()).toBe(404);
    expect((await page.goto(`/groups/${groupA}/invites/not-a-uuid`))?.status()).toBe(404);
    const { error } = await me.client.rpc("group_invite_people", { p_invite: inviteB });
    expect(error?.code).toBe("42501");

    // A member of A (not an admin) can't open A's invite either.
    const member = await newMember("invdet-a-member");
    await joinAs(member, tokenA);
    const { error: memberError } = await member.client.rpc("group_invite_people", { p_invite: inviteA });
    expect(memberError?.code).toBe("42501");
  });
});
