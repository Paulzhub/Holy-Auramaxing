import { expect } from "@playwright/test";

import { signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin, createConfirmedUser, strongPassword, uniqueEmail } from "./support/supabase";

// Phase 3: invites by link, code and QR (CLAUDE.md §7.4, D-037).

test.describe("Invites", () => {
  test.use({ storageState: signedOut });

  test("an admin makes an invite; a friend follows the link, signs in, accepts the covenant and joins", async ({
    page,
    browser,
  }) => {
    const owner = await apiAs(await signInNewMember(page, "invite-owner"));
    const groupId = await createGroupAs(owner, "Morning Light", { minShareLevel: "streak", hiding: false });

    await page.goto(`/groups/${groupId}/invites`);
    await page.getByLabel("Works for").selectOption("3");
    await page.getByRole("button", { name: "Make an invite" }).click();
    const panel = page.getByRole("region", { name: "Your invite is ready" });
    await expect(panel).toBeFocused();
    const link = (await page.getByTestId("invite-link").textContent())!.trim();
    const code = (await page.getByTestId("invite-code").textContent())!.trim();
    expect(link).toMatch(/\/join\/[A-Za-z0-9_-]{27}$/);
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    // A themed QR code, drawn on the server as an SVG.
    await expect(panel.getByRole("img", { name: "QR code for the invite link" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Download QR code" })).toHaveAttribute("download", "invite-qr.svg");
    // Only hashes are stored: neither the token nor the code is in the database.
    const { data: rows } = await admin().from("group_invites").select("token_hash, code_hash").eq("group_id", groupId);
    expect(JSON.stringify(rows)).not.toContain(link.split("/join/")[1]);
    expect(JSON.stringify(rows).toLowerCase()).not.toContain(code.replace("-", "").toLowerCase());

    // A friend, signed out, follows the link: only the name and member count.
    const friendContext = await browser.newContext({ storageState: signedOut });
    const friendPage = await friendContext.newPage();
    const path = new URL(link).pathname;
    await friendPage.goto(path);
    await expect(friendPage).toHaveURL(/\/join$/);
    await expect(friendPage.getByRole("heading", { name: "You're invited to Morning Light" })).toBeVisible();
    await expect(friendPage.getByText("1 member", { exact: true })).toBeVisible();
    await expect(friendPage.getByText("We walk together in grace and honesty.")).toHaveCount(0);
    const robots = await friendPage.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");

    // Signs in and lands back on the invite, now with the covenant.
    const email = uniqueEmail("invite-friend");
    const password = strongPassword();
    const friendId = await createConfirmedUser(email, password);
    await friendPage.getByRole("link", { name: "Sign in" }).click();
    await friendPage.locator("#email").fill(email);
    await friendPage.locator("#current-password").fill(password);
    await friendPage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(friendPage).toHaveURL(/\/join$/);
    await expect(friendPage.getByText("We walk together in grace and honesty.")).toBeVisible();
    await expect(friendPage.getByText("Everyone shares at least: Streak")).toBeVisible();
    const share = friendPage.getByRole("group", { name: "What you share with this group" });
    await expect(share.getByRole("radio")).toHaveCount(2);
    await expect(friendPage.getByLabel("Hide me from this group's leaderboard")).toHaveCount(0);

    // Accepting is required.
    await friendPage.getByRole("button", { name: "Join the group" }).click();
    await expect(friendPage.getByRole("alert").filter({ hasText: "tick the box" })).toBeVisible();
    await friendPage.getByLabel("I accept this covenant").check();
    await share.getByLabel("Full").check();
    await friendPage.getByRole("button", { name: "Join the group" }).click();
    await expect(friendPage).toHaveURL(new RegExp(`/groups/${groupId}\\?notice=joined$`));
    const { data: membership } = await admin()
      .from("group_members")
      .select("status, share_level, covenant_accepted_at")
      .eq("group_id", groupId)
      .eq("user_id", friendId)
      .single();
    expect(membership).toMatchObject({ status: "active", share_level: "full" });
    expect(membership?.covenant_accepted_at).toBeTruthy();

    await friendContext.close();

    // Someone else joins with the short code (typed loosely).
    const thirdContext = await browser.newContext({ storageState: signedOut });
    const thirdPage = await thirdContext.newPage();
    const third = await signInNewMember(thirdPage, "invite-code");
    await thirdPage.goto("/groups");
    await thirdPage.getByRole("link", { name: "Join with a code" }).click();
    await thirdPage.getByLabel("Invite code").fill(code.toLowerCase().replace("-", " "));
    await thirdPage.getByRole("button", { name: "Find the group" }).click();
    await expect(thirdPage).toHaveURL(/\/join$/);
    await thirdPage.getByLabel("I accept this covenant").check();
    await thirdPage.getByRole("button", { name: "Join the group" }).click();
    await expect(thirdPage).toHaveURL(new RegExp(`/groups/${groupId}\\?notice=joined$`));
    expect(
      (await admin().from("group_members").select("user_id").eq("group_id", groupId).eq("user_id", third.userId)).data,
    ).toHaveLength(1);
    await thirdContext.close();
  });

  test("expired, stopped and used-up invites are refused kindly", async ({ page }) => {
    const owner = await newMember("refuse-owner");
    const groupId = await createGroupAs(owner, "Narrow Gate");
    const expired = await createInviteAs(owner, groupId);
    await admin()
      .from("group_invites")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", expired.inviteId);
    const stopped = await createInviteAs(owner, groupId);
    await owner.client.rpc("revoke_group_invite", { p_invite: stopped.inviteId });
    const once = await createInviteAs(owner, groupId, { maxUses: 1 });
    const first = await newMember("refuse-first");
    const { joinAs } = await import("./support/groups");
    await joinAs(first, once.token);

    await signInNewMember(page, "refuse-visitor");
    for (const [token, message] of [
      [expired.token, "This invite has expired. Please ask for a new one."],
      [stopped.token, "This invite was stopped. Please ask for a new one."],
      [once.token, "This invite has been used as many times as it allows. Please ask for a new one."],
      ["NotARealTokenNotARealToken0", "We couldn't find that invite."],
    ] as const) {
      await page.goto(`/join/${token}`);
      await expect(page).toHaveURL(/\/join$/);
      await expect(page.getByText(message)).toBeVisible();
      await expect(page.getByRole("button", { name: "Join the group" })).toHaveCount(0);
    }

    // A wrong code, then too many wrong codes.
    await page.goto("/join");
    const tryCode = async () => {
      await page.getByLabel("Invite code").fill("ZZZZZ-ZZZZZ");
      const answered = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/join"));
      await page.getByRole("button", { name: "Find the group" }).click();
      await answered;
    };
    for (let i = 0; i < 5; i++) {
      await tryCode();
      // The field's own message (the page-level one is about the held link).
      await expect(
        page.getByText("We couldn't find that invite. Please check it, or ask for a new one."),
      ).toBeVisible();
      // The typed code stays, so a typo can be fixed in place.
      await expect(page.getByLabel("Invite code")).toHaveValue("ZZZZZ-ZZZZZ");
    }
    await tryCode();
    await expect(page.getByText("Please wait 15 minutes")).toBeVisible();
  });

  test("an invite opened before signing in waits at the end of onboarding", async ({ page }) => {
    const owner = await newMember("onboard-owner");
    const groupId = await createGroupAs(owner, "First Light");
    const { token } = await createInviteAs(owner, groupId);

    await page.goto(`/join/${token}`);
    await expect(page.getByRole("heading", { name: "You're invited to First Light" })).toBeVisible();
    await signInNewMember(page, "onboard-invitee", { onboarded: false });
    await page.goto("/welcome?step=group");
    await expect(page.getByText("You were invited to First Light.")).toBeVisible();
    await page.getByRole("button", { name: "Join First Light" }).click();
    await expect(page).toHaveURL(/\/join$/);
    await page.getByLabel("I accept this covenant").check();
    await page.getByRole("button", { name: "Join the group" }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}\\?notice=joined$`));
    await expect(page.getByRole("heading", { level: 1, name: "First Light" })).toBeVisible();
  });

  test("a group that approves new members turns an invite into a request", async ({ page, browser }) => {
    const owner = await apiAs(await signInNewMember(page, "approve-owner"));
    const groupId = await createGroupAs(owner, "Watchful Ones", { joinPolicy: "request_to_join" });
    const { token } = await createInviteAs(owner, groupId);

    const askerContext = await browser.newContext({ storageState: signedOut });
    const asker = await askerContext.newPage();
    const askerAccount = await signInNewMember(asker, "approve-asker");
    await admin().from("profiles").update({ display_name: "Asker" }).eq("id", askerAccount.userId);
    await asker.goto(`/join/${token}`);
    await expect(asker.getByText("An owner or admin will approve your request.")).toBeVisible();
    await asker.getByLabel("I accept this covenant").check();
    await asker.getByRole("button", { name: "Ask to join" }).click();
    await expect(asker).toHaveURL(/\/groups\?notice=requested$/);
    await expect(asker.getByText("Waiting for approval")).toBeVisible();
    // Waiting: the group's pages stay closed.
    expect((await asker.goto(`/groups/${groupId}`))?.status()).toBe(404);

    await page.goto(`/groups/${groupId}/members`);
    const pending = page.getByTestId("pending-list");
    await pending.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Request approved.")).toBeVisible();
    await expect(page.getByTestId("member-list")).toContainText("Asker");

    await asker.goto(`/groups/${groupId}`);
    await expect(asker.getByRole("heading", { level: 1, name: "Watchful Ones" })).toBeVisible();
    await askerContext.close();
  });

  test("admins stop and replace invites", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "replace-owner"));
    const groupId = await createGroupAs(owner, "Second Wind");
    await createInviteAs(owner, groupId);

    await page.goto(`/groups/${groupId}/invites`);
    const list = page.getByTestId("invite-list");
    await expect(list.getByText("Working")).toBeVisible();
    await list.getByRole("button", { name: "Replace with a new one" }).click();
    await expect(page.getByRole("heading", { name: "Your invite is ready" })).toBeVisible();
    await expect(page.getByTestId("invite-list").getByText("Stopped")).toBeVisible();

    await page.getByTestId("invite-list").locator("summary", { hasText: "Stop this invite" }).click();
    await page.getByTestId("invite-list").getByRole("button", { name: "Stop this invite" }).click();
    await expect(page.getByText("The invite is stopped.")).toBeVisible();
    await expect(page.getByTestId("invite-list").getByText("Working")).toHaveCount(0);
  });
});
