import { mkdirSync } from "node:fs";

import type { Browser, Page } from "@playwright/test";

import { expect, expectNoAxeViolations, signedOut, test, themes } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember, type Member } from "./support/groups";
import { clippedText, overflowing, widenTextSpacing } from "./support/layout";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Accessibility review 2 (docs/accessibility-review-2.md): every route changed
// since review 1, in a group with real content (posts, a report, a partner,
// nudges, alerts), in both themes, at 320 px and with wider text spacing,
// plus where focus goes after a form is sent.

const STATE = "test-results/.a11y-review-2-owner.json";

function kolkata(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

async function name(m: { userId: string }, displayName: string) {
  const { error } = await admin().from("profiles").update({ display_name: displayName }).eq("id", m.userId);
  if (error) throw error;
}

interface Seed {
  me: Member;
  friend: Member;
  groupId: string;
  postId: string;
  inviteId: string;
}

/** One group with something on every page; the owner signs in through the form. */
async function seed(browser: Browser, baseURL: string): Promise<Seed> {
  const context = await browser.newContext({ storageState: signedOut, baseURL });
  const page = await context.newPage();
  const me = await apiAs(await signInNewMember(page, "a11y2-owner"));
  await name(me, "Olive Owner");
  const groupId = await createGroupAs(me, "Morning Light Fellowship");
  const { token } = await createInviteAs(me, groupId, { maxUses: 10 });
  const friend = await newMember("a11y2-friend");
  // A long name: the leaderboard must wrap it, never cut it off (A2-1).
  await name(friend, "Bartholomew Featherstonehaugh-Whitt");
  await joinAs(friend, token, "full");
  const quiet = await newMember("a11y2-quiet");
  await name(quiet, "Quinn Quiet");
  await joinAs(quiet, token, "checkin_only");
  const { inviteId } = await createInviteAs(me, groupId, { maxUses: 3 });

  await me.client.rpc("submit_checkin", { p_local_date: kolkata(), p_outcome: "clean" });
  await friend.client.rpc("submit_checkin", { p_local_date: kolkata(), p_outcome: "clean" });
  const { data: pid } = await me.client.rpc("request_partner", { p_group: groupId, p_user: friend.userId });
  await friend.client.rpc("respond_partner", { p_partnership: pid, p_accept: true });
  const { data: postId } = await me.client.rpc("create_post", {
    p_group: groupId,
    p_kind: "prayer_request",
    p_body: "Please pray for strength this week.",
  });
  await friend.client.rpc("create_comment", { p_post: postId, p_body: "Praying for you." });
  const { data: reported } = await quiet.client.rpc("create_post", {
    p_group: groupId,
    p_kind: "encouragement",
    p_body: "A post someone reports.",
  });
  await friend.client.rpc("report_content", {
    p_group: groupId,
    p_target_type: "post",
    p_target: reported,
    p_reason: "spam",
    p_note: null,
  });
  await friend.client.rpc("send_nudge", { p_group: groupId, p_to: me.userId, p_kind: "praying" });

  mkdirSync("test-results", { recursive: true });
  await context.storageState({ path: STATE });
  await context.close();
  return { me, friend, groupId, postId: postId as string, inviteId };
}

/** A page's result banner (its role=status paragraph). */
function notice(page: Page, text: string) {
  return page.locator("main .auth-banner", { hasText: text });
}

function routesFor(s: Seed): string[] {
  const g = `/groups/${s.groupId}`;
  return [
    g,
    `${g}/wall`,
    `${g}/wall/${s.postId}`,
    `${g}/leaderboard`,
    `${g}/leaderboard?board=2`,
    `${g}/leaderboard?board=3`,
    `${g}/leaderboard?board=4&period=week`,
    `${g}/leaderboard?board=5`,
    `${g}/members`,
    `${g}/moderation`,
    `${g}/partner`,
    `${g}/settings`,
    `${g}/invites`,
    `${g}/invites/${s.inviteId}`,
    `/check-in/done?date=${kolkata()}`,
    "/alerts",
    "/settings/notifications",
    "/settings/blocked",
  ];
}

test.describe("accessibility review 2", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });
  test.skip(({ isMobile }) => isMobile, "sets its own viewports");

  let s: Seed;
  let owner: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    s = await seed(browser, baseURL!);
  });

  test.beforeEach(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ storageState: STATE, baseURL, reducedMotion: "reduce" });
    owner = await context.newPage();
  });

  test.afterEach(async () => {
    await owner.context().close();
  });

  test("no axe violations on the changed pages, in both themes", async ({ baseURL }) => {
    for (const theme of themes) {
      await owner.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      for (const route of routesFor(s)) {
        await owner.goto(route);
        await owner.waitForLoadState("networkidle");
        await expectNoAxeViolations(owner, `${route} (${theme})`);
      }
    }
  });

  test("320 px with wider text spacing: nothing scrolls sideways or is cut off (1.4.10, 1.4.12)", async () => {
    await owner.setViewportSize({ width: 320, height: 640 });
    for (const route of routesFor(s)) {
      await owner.goto(route);
      await owner.waitForLoadState("networkidle");
      expect(await overflowing(owner), `${route} at 320 px`).toEqual([]);
      expect(await clippedText(owner), `${route} at 320 px`).toEqual([]);
      await widenTextSpacing(owner);
      expect(await overflowing(owner), `${route} with text spacing`).toEqual([]);
      expect(await clippedText(owner), `${route} with text spacing`).toEqual([]);
    }
  });

  test("leaderboard names wrap instead of being cut off (A2-1)", async () => {
    await owner.setViewportSize({ width: 320, height: 640 });
    await owner.goto(`/groups/${s.groupId}/leaderboard`);
    const board = owner.getByTestId("leaderboard");
    await expect(board).toContainText("Bartholomew Featherstonehaugh-Whitt");
    await expect(board.getByText("Olive Owner")).toBeVisible();
    const cut = await board
      .locator(".ui-lb-row__name > span:first-child")
      .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
    expect(cut).toBe(0);
  });

  test("after a form is sent, focus goes to its notice (A2-3, 2.4.3 and 4.1.3)", async () => {
    // Mark one alert as read: the button goes away with the alert.
    await expect(async () => {
      await owner.goto("/alerts");
      await expect(owner.getByRole("button", { name: /^Mark as read/ }).first()).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await owner
      .getByRole("button", { name: /^Mark as read/ })
      .first()
      .press("Enter");
    await expect(notice(owner, "Marked as read.")).toBeFocused();

    // Settings saved at the bottom of a long page.
    await owner.goto("/settings/notifications");
    await owner.getByRole("button", { name: "Snooze for a day" }).press("Enter");
    await expect(notice(owner, "Snoozed.")).toBeFocused();

    // A nudge from the group's home.
    await owner.goto(`/groups/${s.groupId}`);
    await owner.locator(".group-today__row summary").first().press("Enter");
    await owner.locator(".group-today__row details[open] button").first().press("Enter");
    await expect(notice(owner, "Nudge sent.")).toBeFocused();
  });

  test("forms that report inline keep focus where it was", async () => {
    await owner.goto(`/groups/${s.groupId}/wall`);
    const love = owner.getByRole("button", { name: /^Love/ }).first();
    await love.press("Enter");
    await expect(owner.getByRole("button", { name: /^Love, 1 reaction, including yours/ }).first()).toBeFocused();
  });

  test("the moderation queue's reports sit under its heading (A2-5, 1.3.1)", async () => {
    await owner.goto(`/groups/${s.groupId}/moderation`);
    await expect(owner.getByRole("heading", { level: 2, name: "Reports" })).toBeVisible();
    await expect(owner.getByRole("heading", { level: 3, name: /A post by/ })).toBeVisible();
  });

  test("forced colours: the current tab still stands out (A2-7)", async () => {
    await owner.emulateMedia({ forcedColors: "active" });
    const outline = (sel: string) =>
      owner
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).outlineStyle);
    await owner.goto(`/groups/${s.groupId}/leaderboard?board=4&period=week`);
    expect(await outline('.lb-tabs__link[aria-current="page"]')).toBe("solid");
    expect(await outline('.lb-periods__link[aria-current="page"]')).toBe("solid");
    expect(await outline(".lb-tabs__link:not([aria-current])")).toBe("none");
    await owner.goto(`/groups/${s.groupId}/wall?kind=prayer_request`);
    expect(await outline('.wall-filters__link[aria-current="page"]')).toBe("solid");
    await owner.goto("/progress");
    expect(await outline('.range-nav__link[aria-current="page"]')).toBe("solid");
  });

  test("the level card is named for what it is (A2-9)", async () => {
    await owner.goto("/progress");
    await expect(owner.getByRole("region", { name: "Your level Clay" })).toBeVisible();
  });
});

test.describe("after checking in (A2-4, 4.1.3)", () => {
  test.skip(({ isMobile }) => isMobile, "one viewport is enough");
  test.use({ storageState: signedOut });

  test("focus lands on the thank-you heading, which reads out that it was saved", async ({ page }) => {
    await signInNewMember(page, "a11y2-checkin");
    await page.goto("/check-in");
    await page.getByRole("button", { name: /I stayed free today/ }).press("Enter");
    await expect(page).toHaveURL(/\/check-in\/done/);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveAccessibleDescription(/^Saved/);
  });
});

test.describe("the bottom navigation (A2-6, 2.5.3)", () => {
  test.use({ storageState: signedOut, viewport: { width: 390, height: 800 } });
  test.skip(({ isMobile }) => isMobile, "sets its own viewport");

  test("Alerts' name starts with its visible label", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "a11y2-bell"));
    const groupId = await createGroupAs(me, "Bell group");
    const { token } = await createInviteAs(me, groupId);
    const friend = await newMember("a11y2-bell-friend");
    await joinAs(friend, token);
    const alerts = page.locator(".shell-bottomnav").getByRole("link", { name: /^Alerts ?, 1 unread$/ });
    await expect(async () => {
      await page.goto("/home");
      await expect(alerts).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 45_000, intervals: [2_000, 3_000] });
  });
});

test.describe("unsubscribe page", () => {
  test.use({ storageState: signedOut });
  test.skip(({ isMobile }) => isMobile, "one viewport is enough");

  test("an old link gets a short heading and the way forward under it", async ({ page }) => {
    await page.goto("/unsubscribe?k=not-a-real-token");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link isn’t valid any more");
    await expect(page.getByText("You can change what reaches you")).toBeVisible();
    for (const theme of themes) {
      await page.context().addCookies([{ name: "theme", value: theme, url: page.url() }]);
      await page.reload();
      await expectNoAxeViolations(page, `unsubscribe (${theme})`);
    }
  });
});
