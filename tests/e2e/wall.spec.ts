import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember, type Member } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 6a: the encouragement wall, reactions, report and block, and the
// automatic filter (CLAUDE.md §7.7, §7.11; D-077 to D-081). The rules are
// proven in pgTAP 080 and 022; here we check the pages, by keyboard, and the
// "done when" items: markup shows as text, and a blocked person can no longer
// see or reach the person who blocked them anywhere.

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

async function at320(page: Page, label: string) {
  await page.setViewportSize({ width: 320, height: 720 });
  await noOverflow(page, `${label} at 320px`);
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function post(member: Member, groupId: string, kind: string, body: string): Promise<string> {
  const { data, error } = await member.client.rpc("create_post", { p_group: groupId, p_kind: kind, p_body: body });
  if (error) throw error;
  return data as string;
}

const kolkataToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

test.describe("The encouragement wall", () => {
  test.use({ storageState: signedOut });
  test.describe.configure({ timeout: 120_000 });

  test("post, react, comment, edit and delete by keyboard; markup shows as plain text", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "wall-owner"));
    await name(owner, "Olive Owner");
    const groupId = await createGroupAs(owner, "Wall Street");
    const { token } = await createInviteAs(owner, groupId);
    const friend = await newMember("wall-friend");
    await name(friend, "Fran Friend");
    await joinAs(friend, token);

    await page.goto(`/groups/${groupId}/wall`);
    await expect(page).toHaveTitle(/^Wall \|/);
    await expect(page.getByRole("link", { name: "Wall", exact: true })).toHaveAttribute("aria-current", "page");
    await expectNoAxeViolations(page, "empty wall");

    // ---- posting, by keyboard: choose the kind, type, submit with Enter.
    const hostile = `<script>window.__xss=1</script><img src=x onerror="window.__xss=2"><b>bold?</b>\nSecond line`;
    await page.getByRole("radio", { name: "Prayer request" }).focus();
    await page.keyboard.press("Space");
    await page.getByLabel("Your words", { exact: true }).focus();
    await page.keyboard.insertText(hostile);
    await page.getByRole("button", { name: "Post to the group" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Posted to your group." })).toBeAttached();

    const article = page.getByRole("article").filter({ hasText: "window.__xss" });
    await expect(article).toHaveCount(1);
    const body = article.locator(".wall-post__body");
    await expect(body).toHaveText(hostile);
    // Shown as text: no element was made from it, and nothing ran.
    await expect(article.locator("script, img, b")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(article.getByRole("heading", { name: /You/ })).toContainText("Prayer request");
    // The textarea is empty again for the next post.
    await expect(page.getByLabel("Your words", { exact: true })).toHaveValue("");

    // ---- "I prayed": Fran prays through the API; the owner sees the count.
    const postId = await post(owner, groupId, "encouragement", "Keep going, friends.");
    const { data: rows } = await owner.client.rpc("group_wall", { p_group: groupId, p_kind: "prayer_request" });
    const prayerId = (rows as { id: string }[])[0]!.id;
    const { error: prayError } = await friend.client.rpc("set_reaction", {
      p_target_type: "post",
      p_target: prayerId,
      p_kind: "pray",
      p_on: true,
    });
    expect(prayError).toBeNull();
    await page.reload();
    const prayer = page.getByRole("article").filter({ hasText: "window.__xss" });
    const prayButton = prayer.getByRole("button", { name: /^I prayed, 1 reaction\. Add yours\./ });
    await expect(prayButton).toHaveAttribute("aria-pressed", "false");
    await prayButton.focus();
    await page.keyboard.press("Enter");
    await expect(prayer.getByRole("button", { name: /^I prayed, 2 reactions, including yours/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // G-10: the strong reaction reads "With you".
    const keep = page.getByRole("article").filter({ hasText: "Keep going, friends." });
    await expect(keep.getByRole("button", { name: /^With you, no reactions yet/ })).toBeVisible();

    // ---- comments: open the post, comment, edit, delete.
    await keep.getByRole("link", { name: /Comment on this post/ }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/wall/${postId}$`));
    await page.getByLabel("Your comment").fill("Amen. <i>With you</i> all the way.");
    await page.getByRole("button", { name: "Add comment" }).click();
    const comments = page.getByTestId("comment-list");
    await expect(comments.locator(".wall-post__body")).toHaveText("Amen. <i>With you</i> all the way.");
    await expect(comments.locator("i")).toHaveCount(0);
    await expectNoAxeViolations(page, "a post with a comment");
    await at320(page, "post page");

    await comments.getByText("Edit", { exact: true }).click();
    const edit = comments.getByLabel("Edit your words");
    await edit.fill("Amen, all the way.");
    await comments.getByRole("button", { name: "Save" }).click();
    await expect(comments.locator(".wall-post__body")).toHaveText("Amen, all the way.");
    await expect(comments.locator(".wall-post__when")).toContainText("Edited");

    await comments.getByText("Delete", { exact: true }).click();
    await comments.getByRole("button", { name: "Yes, delete it" }).click();
    await expect(page.getByText("Comment deleted.")).toBeVisible();
    await expect(page.getByTestId("comment-list")).toHaveCount(0);

    // ---- an announcement, pinned, shows first; the home card shows the wall.
    const announcement = await post(owner, groupId, "announcement", "Prayer night on Friday.");
    await page.goto(`/groups/${groupId}/wall`);
    const pinForm = page.getByRole("article").filter({ hasText: "Prayer night on Friday." });
    await pinForm.getByRole("button", { name: "Pin to the top" }).click();
    await expect(page.getByText("Pinned to the top of the wall.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pinned", exact: true })).toBeVisible();
    await expectNoAxeViolations(page, "wall with posts");
    await at320(page, "wall");
    await page.goto(`/groups/${groupId}`);
    const home = page.locator(".wall-home");
    await expect(home.getByText("Prayer night on Friday.")).toBeVisible();
    await expect(home.getByText("Pinned")).toBeVisible();
    await expectNoAxeViolations(page, "group home with the wall");

    // ---- filters are links.
    await page.goto(`/groups/${groupId}/wall?kind=testimony`);
    await expect(page.getByRole("link", { name: "Testimonies" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Nothing of this kind yet.")).toBeVisible();

    // ---- deleting my own post; a member can't delete someone else's (API).
    const { error: notMine } = await friend.client.rpc("delete_post", { p_post: announcement });
    expect(notMine?.code).toBe("42501");
    await page.goto(`/groups/${groupId}/wall`);
    const mine = page.getByRole("article").filter({ hasText: "Keep going, friends." });
    await mine.getByText("Delete", { exact: true }).click();
    await mine.getByRole("button", { name: "Yes, delete it" }).click();
    await expect(page.getByText("Deleted.", { exact: true })).toBeVisible();
    await expect(page.getByText("Keep going, friends.")).toHaveCount(0);
  });

  test("the filter refuses slurs and explicit links, and keeps what was typed", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "wall-filter"));
    const groupId = await createGroupAs(me, "Kind Words");
    await page.goto(`/groups/${groupId}/wall`);

    const words = page.getByLabel("Your words", { exact: true });
    await words.fill("Look at this: www.pornhub.com/view");
    await page.getByRole("button", { name: "Post to the group" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "aren't allowed here" });
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
    await expect(words).toHaveValue("Look at this: www.pornhub.com/view");

    await words.fill("Help that worked for me: https://www.covenanteyes.com/porn-addiction-help/");
    await page.getByRole("button", { name: "Post to the group" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Posted to your group." })).toBeAttached();
    // A link is shown as text, never as a link.
    const article = page.getByRole("article").filter({ hasText: "covenanteyes" });
    await expect(article.getByRole("link", { name: /covenanteyes/ })).toHaveCount(0);

    // The same filter applies when calling the API directly.
    const { error } = await me.client.rpc("create_post", {
      p_group: groupId,
      p_kind: "encouragement",
      p_body: "you r e t a r d",
    });
    expect(error?.message).toBe("content_blocked");
  });

  test("a blocked person can no longer see or reach the blocker anywhere", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "wall-blocker"));
    await name(me, "Bea Blocker");
    const groupId = await createGroupAs(me, "Safe Place");
    const { token } = await createInviteAs(me, groupId);
    const other = await newMember("wall-blocked");
    await name(other, "Rex Rude");
    await joinAs(other, token);
    const third = await newMember("wall-third");
    await name(third, "Tia Third");
    await joinAs(third, token);

    const myPost = await post(me, groupId, "encouragement", "From Bea, for everyone.");
    const theirPost = await post(other, groupId, "encouragement", "Rex was here.");
    const { error: commentError } = await other.client.rpc("create_comment", {
      p_post: myPost,
      p_body: "A comment from Rex.",
    });
    expect(commentError).toBeNull();
    await other.client.rpc("submit_checkin", { p_local_date: kolkataToday(), p_outcome: "clean" });

    // Block from the Members page, by keyboard.
    await page.goto(`/groups/${groupId}/members`);
    await page.getByText("Block Rex Rude", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Yes, block" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Blocked. You won't see each other in your groups.")).toBeVisible();
    await expect(page.getByTestId("member-list").getByText("Rex Rude", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("member-list").getByText("Tia Third", { exact: true })).toBeVisible();

    // My pages no longer show Rex.
    for (const path of ["", "/wall", `/wall/${myPost}`, "/leaderboard", "/leaderboard?board=encourager"]) {
      await page.goto(`/groups/${groupId}${path}`);
      await expect(page.getByText(/Rex/), path || "home").toHaveCount(0);
    }
    expect((await page.goto(`/groups/${groupId}/wall/${theirPost}`))?.status()).toBe(404);

    // Rex, through the API: nothing of mine, and no way to reach me.
    const { data: wall } = await other.client.rpc("group_wall", { p_group: groupId });
    expect((wall as { author_id: string }[]).map((p) => p.author_id)).not.toContain(me.userId);
    const { data: card } = await other.client.from("profile_cards").select("id").eq("id", me.userId);
    expect(card).toEqual([]);
    const { data: members } = await other.client.from("group_members").select("user_id").eq("group_id", groupId);
    expect((members ?? []).map((m) => m.user_id)).not.toContain(me.userId);
    const { data: today } = await other.client.from("group_checkins_today").select("user_id").eq("group_id", groupId);
    expect((today ?? []).map((m) => m.user_id)).not.toContain(me.userId);
    const { data: posts } = await other.client.from("posts").select("id").eq("author_id", me.userId);
    expect(posts).toEqual([]);
    const { data: board } = await other.client.rpc("group_leaderboard", { p_group: groupId, p_board: "xp" });
    expect((board as { member_id: string | null }[]).map((r) => r.member_id)).not.toContain(me.userId);
    for (const [fn, args] of [
      ["create_comment", { p_post: myPost, p_body: "Still here?" }],
      ["set_reaction", { p_target_type: "post", p_target: myPost, p_kind: "heart", p_on: true }],
      ["report_content", { p_group: groupId, p_target_type: "post", p_target: myPost, p_reason: "spam" }],
      ["wall_post", { p_post: myPost }],
    ] as const) {
      const { error } = await other.client.rpc(fn, args);
      expect(error?.code, fn).toBe("42501");
    }
    // Tia, who blocked nobody, still sees us both.
    const { data: tiaWall } = await third.client.rpc("group_wall", { p_group: groupId });
    expect((tiaWall as { author_id: string }[]).map((p) => p.author_id)).toEqual(
      expect.arrayContaining([me.userId, other.userId]),
    );

    // Settings → Blocked people, and unblocking.
    await page.goto("/settings/blocked");
    await expect(page).toHaveTitle(/^Blocked people \|/);
    await expectNoAxeViolations(page, "blocked people");
    await at320(page, "blocked people");
    await page.getByRole("button", { name: "Unblock Rex Rude" }).click();
    await expect(page.getByText("Unblocked.")).toBeVisible();
    await page.goto(`/groups/${groupId}/wall`);
    await expect(page.getByText("Rex was here.")).toBeVisible();
  });

  test("a report reaches the admins without the reporter's name", async ({ page }) => {
    const owner = await newMember("wall-rep-owner");
    await name(owner, "Ona Owner");
    const groupId = await createGroupAs(owner, "Report Room");
    const { token } = await createInviteAs(owner, groupId);
    const adminMember = await newMember("wall-rep-admin");
    await name(adminMember, "Ada Admin");
    await joinAs(adminMember, token);
    await owner.client.rpc("set_group_member_role", { p_group: groupId, p_user: adminMember.userId, p_role: "admin" });
    const me = await apiAs(await signInNewMember(page, "wall-reporter"));
    await name(me, "Remy Reporter");
    await joinAs(me, token);
    await post(adminMember, groupId, "encouragement", "Words that hurt someone.");

    await page.goto(`/groups/${groupId}/wall`);
    const article = page.getByRole("article").filter({ hasText: "Words that hurt someone." });
    await article.getByText("Report", { exact: true }).click();
    await article.getByRole("radio", { name: "Unkind or hurtful" }).check();
    await article.getByLabel("Anything they should know? (optional)").fill("This felt harsh.");
    await article.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Thank you. The group's admins will look at it.")).toBeVisible();

    // The owner sees it, with the text as it was, never who sent it.
    const { data: reports } = await owner.client.rpc("group_reports", { p_group: groupId });
    expect(reports).toHaveLength(1);
    expect(JSON.stringify(reports)).not.toContain(me.userId);
    expect((reports as { snapshot: string }[])[0]!.snapshot).toBe("Words that hurt someone.");
    const { error: columnError } = await owner.client.from("reports").select("reporter_id");
    expect(columnError).not.toBeNull();
    // The admin it's about doesn't.
    const { data: theirs } = await adminMember.client.rpc("group_reports", { p_group: groupId });
    expect(theirs).toEqual([]);
    // A member can't open the moderation page.
    expect((await page.goto(`/groups/${groupId}/moderation`))?.status()).toBe(404);
  });

  test("the moderation page, for the owner", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "wall-mod-owner"));
    const groupId = await createGroupAs(owner, "Mod Squad");
    const { token } = await createInviteAs(owner, groupId);
    const a = await newMember("wall-mod-a");
    const b = await newMember("wall-mod-b");
    await name(a, "Abe Author");
    await joinAs(a, token);
    await joinAs(b, token);
    const postId = await post(a, groupId, "encouragement", "Buy my course at a discount!");
    const { error } = await b.client.rpc("report_content", {
      p_group: groupId,
      p_target_type: "post",
      p_target: postId,
      p_reason: "spam",
      p_note: null,
    });
    expect(error).toBeNull();

    await page.goto(`/groups/${groupId}/moderation`);
    await expect(page).toHaveTitle(/^Moderation \|/);
    const list = page.getByTestId("report-list");
    await expect(list.getByRole("heading", { name: "A post by Abe Author" })).toBeVisible();
    await expect(list.getByText("Reason: Spam or selling")).toBeVisible();
    await expectNoAxeViolations(page, "moderation");
    await at320(page, "moderation");
    await list.getByText("Remove", { exact: true }).click();
    await list.getByRole("button", { name: "Yes, remove it" }).click();
    await expect(page.getByText("Deleted.", { exact: true })).toBeVisible();
    await expect(page.getByText("It has already been deleted.")).toBeVisible();
    await page.getByRole("button", { name: "Mark as dealt with" }).click();
    await expect(page.getByText("Report closed as dealt with.")).toBeVisible();
    await expect(page.getByText("No open reports. Thank you for looking after your group.")).toBeVisible();
  });
});
