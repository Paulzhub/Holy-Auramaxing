import { readFileSync } from "node:fs";

import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, setTheme, signedOut, test, themes } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember, type Member } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 4: daily check-ins and streaks (CLAUDE.md §7.5).

/** Test accounts live in Asia/Kolkata (support/supabase.ts). */
function kolkataDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

/** Earlier clean days, written straight into the table (outside the window, as history). */
async function seedCleanDays(userId: string, daysAgo: number[]) {
  const { error } = await admin()
    .from("checkins")
    .insert(
      daysAgo.map((n) => ({
        user_id: userId,
        local_date: kolkataDate(-n),
        timezone: "Asia/Kolkata",
        outcome: "clean",
      })),
    );
  if (error) throw error;
}

async function checkInAs(member: Member, outcome: "clean" | "slipped") {
  const { error } = await member.client.rpc("submit_checkin", {
    p_local_date: kolkataDate(),
    p_outcome: outcome,
    p_mood: 2,
    p_urge_level: 4,
    p_triggers: ["lonely"],
    p_note_encrypted: null as unknown as string,
  });
  if (error) throw error;
}

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(0);
}

/** Words that never appear around a slip (§2.1: grace, not shame). */
const SHAME_WORDS = /\b(fail\w*|relapse\w*|shame\w*|ashamed|ruin\w*|broke|broken|weak|disappoint\w*|bad)\b/i;

test.describe("Check-ins", () => {
  test.use({ storageState: signedOut });

  test("a clean day, a changed answer, the slip page, what was kept, and a private reflection", async ({ page }) => {
    const me = await signInNewMember(page, "checkin-flow");
    await seedCleanDays(me.userId, [4, 3, 2, 1]);

    // Today: a clean answer with every optional detail.
    await page.goto("/check-in");
    await expect(page.getByRole("heading", { name: /How was today\?/ })).toBeVisible();
    await page.getByText("Add how it went (optional)").click();
    await page.getByRole("group", { name: "Mood" }).getByLabel("Good").check();
    await page.getByRole("group", { name: "Strongest urge" }).getByLabel("Mild").check();
    await page.getByRole("group", { name: "Anything that played a part?" }).getByLabel("Tired").check();
    await page.getByLabel("Private note").fill("secret words 123");
    await page.getByRole("button", { name: "I stayed free today" }).click();
    await expect(page).toHaveURL(/\/check-in\/done\?date=/);
    await expect(page.getByRole("status")).toHaveText("Saved: you stayed free today.");
    await expect(page.getByRole("progressbar", { name: "Current streak" })).toHaveAttribute(
      "aria-valuetext",
      "5 days, toward your longest of 5",
    );

    // The note is stored encrypted, never as the words typed.
    const { data: row } = await admin()
      .from("checkins")
      .select("note_encrypted, mood, urge_level, triggers")
      .eq("user_id", me.userId)
      .eq("local_date", kolkataDate())
      .single();
    expect(row?.note_encrypted).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(row?.note_encrypted).not.toContain("secret");
    expect(row).toMatchObject({ mood: 4, urge_level: 2, triggers: ["tired"] });

    // Change the answer to a slip: the details are kept, and the slip page opens.
    await page.goto("/check-in");
    await expect(page.getByRole("heading", { name: /checked in for today/ })).toBeVisible();
    await page.getByText("Change your answer").click();
    await expect(page.getByLabel("Private note")).toHaveValue("secret words 123");
    await page.getByRole("button", { name: "I slipped" }).click();
    // The same address as a clean day (D-055): history never shows the answer.
    await expect(page).toHaveURL(/\/check-in\/done\?date=\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole("heading", { level: 1, name: "His mercies are new every morning" })).toBeVisible();
    await expect(page.getByRole("main").getByText("1 John 1:9 (WEB)")).toBeVisible();

    // The owner's request: the streak reset, but everything kept is listed.
    const kept = page.getByRole("region", {
      name: /Your streak starts again, but look at everything you kept/,
    });
    await expect(kept).toContainText("4 free days");
    await expect(kept).toContainText("1 streak built");
    await expect(kept).toContainText("longest streak: 4 days");
    await expect(page.getByRole("heading", { name: "One next step" })).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(SHAME_WORDS);
    await expect(page).toHaveTitle(/^Check in/);

    // The edit is audited, with no content.
    const { data: audits } = await admin()
      .from("audit_log")
      .select("action, metadata")
      .eq("actor_id", me.userId)
      .like("action", "checkin.%");
    expect(audits).toEqual([{ action: "checkin.edited", metadata: {} }]);

    // A private reflection.
    const reflection = page.getByRole("region", { name: "What was going on?" });
    await reflection.getByLabel("Lonely").check();
    await reflection.getByLabel("Your reflection").fill("late scrolling, alone");
    await reflection.getByRole("button", { name: "Save my reflection" }).click();
    await expect(page.getByText("Saved. Only you can read it.")).toBeVisible();
    const { data: after } = await admin()
      .from("checkins")
      .select("outcome, note_encrypted, triggers")
      .eq("user_id", me.userId)
      .eq("local_date", kolkataDate())
      .single();
    expect(after?.outcome).toBe("slipped");
    expect(after?.triggers).toEqual(["lonely", "tired"]);
    expect(after?.note_encrypted).not.toContain("scrolling");

    // Home: today's answer, the streak numbers and what was kept.
    await page.goto("/home");
    await expect(page.getByText("You checked in honestly today. You’re held in grace.")).toBeVisible();
    await expect(page.getByRole("region", { name: /look at everything you kept/ })).toContainText("4 free days");

    // Progress: calendar (today is a forgiven slip), charts, triggers, insights.
    await page.goto("/progress");
    await expect(page.getByRole("heading", { level: 1, name: "Your journey" })).toBeVisible();
    await expect(page.locator(".ui-calendar")).toContainText("Slipped, held in grace");
    await expect(page.getByRole("img", { name: "Mood (1 to 5)" })).toBeVisible();
    await expect(page.locator(".trigger-bars")).toContainText("Lonely");
    await expect(page.getByRole("heading", { name: "What stands out" })).toBeVisible();
    await expect(
      page.getByText("You stayed free on 4 of the 5 days you checked in, and you were honest every time."),
    ).toBeVisible();
  });

  test("the window: yesterday is open only before 12:00, and older days are refused", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "checkin-window"));
    const { error } = await me.client.rpc("submit_checkin", {
      p_local_date: kolkataDate(-3),
      p_outcome: "clean",
      p_mood: null as unknown as number,
      p_urge_level: null as unknown as number,
      p_triggers: [],
      p_note_encrypted: null as unknown as string,
    });
    expect(error?.message).toBe("checkin_window_closed");
    // Asking the page for an old day just shows today.
    await page.goto(`/check-in?date=${kolkataDate(-3)}`);
    await expect(page.getByRole("heading", { name: /How was today\?/ })).toBeVisible();
    // Nobody can write the table directly.
    const direct = await me.client
      .from("checkins")
      .insert({ user_id: me.userId, local_date: kolkataDate(), timezone: "UTC", outcome: "clean" });
    expect(direct.error).not.toBeNull();
  });

  test("a group sees each member's check-in at the level they share there", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "checkin-group-owner"));
    const groupId = await createGroupAs(owner, "Morning Watch");
    const { token } = await createInviteAs(owner, groupId);
    const quiet = await newMember("checkin-quiet");
    const open = await newMember("checkin-open");
    await joinAs(quiet, token, "checkin_only");
    await joinAs(open, token, "full");
    await checkInAs(quiet, "slipped");
    await checkInAs(open, "slipped");

    await page.goto(`/groups/${groupId}`);
    const today = page.getByRole("region", { name: "Today" });
    await expect(today).toContainText("2 of 3 checked in today");
    const rows = today.locator(".group-today__row");
    await expect(rows).toHaveCount(3);
    // Exactly one "slipped" shows: the member who shares everything.
    await expect(today.getByText("Slipped, held in grace")).toHaveCount(1);
    await expect(today).not.toContainText("Lonely");
    // Through the API, too: the checkin_only member's outcome is never there.
    const { data } = await owner.client
      .from("group_checkins_today")
      .select("user_id, checked_in_today, outcome, current_streak, mood")
      .eq("group_id", groupId);
    expect(data?.find((r) => r.user_id === quiet.userId)).toEqual({
      user_id: quiet.userId,
      checked_in_today: true,
      outcome: null,
      current_streak: null,
      mood: null,
    });
    expect(data?.find((r) => r.user_id === open.userId)?.outcome).toBe("slipped");
    const { data: theirs } = await owner.client.from("checkins").select("id").neq("user_id", owner.userId);
    expect(theirs).toEqual([]);
  });

  test("the data export includes my check-ins with my note decrypted", async ({ page }) => {
    await signInNewMember(page, "checkin-export");
    await page.goto("/check-in");
    await page.getByText("Add how it went (optional)").click();
    await page.getByLabel("Private note").fill("only mine");
    await page.getByRole("button", { name: "I stayed free today" }).click();
    await expect(page).toHaveURL(/\/check-in\/done/);
    await page.goto("/settings/data");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download my data/ }).click();
    const file = await (await download).path();
    const zip = readFileSync(file!).toString("utf8");
    expect(zip).toContain("csv/checkins.csv");
    expect(zip).toContain("only mine");
    expect(zip).toContain("group_challenge_counts");
  });
});

test.describe("Joining with the app around you", () => {
  test.use({ storageState: signedOut });

  test("signed in, /join shows the menu, sidebar and switcher; signed out it doesn't", async ({ page, browser }) => {
    const owner = await newMember("join-shell-owner");
    const groupId = await createGroupAs(owner, "Dawn Patrol");
    const { token } = await createInviteAs(owner, groupId);

    await signInNewMember(page, "join-shell");
    await page.goto(`/join/${token}`);
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
    await expect(page.locator(".group-switcher:visible")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Join the group" })).toBeVisible();
    const head = await page.evaluate(() => ({
      robots: document.querySelector('meta[name="robots"]')?.getAttribute("content"),
      referrer: document.querySelector('meta[name="referrer"]')?.getAttribute("content"),
    }));
    expect(head.robots).toContain("noindex");
    expect(head.referrer).toBe("no-referrer");
    await expectNoAxeViolations(page, "/join signed in");
    await page.setViewportSize({ width: 320, height: 640 });
    await noOverflow(page, "/join signed in at 320px");
    await page.getByLabel("I accept this covenant").check();
    await page.getByRole("button", { name: "Join the group" }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}`));

    // Signed out: the invite still opens, in the sign-in frame.
    const visitor = await browser.newContext({ storageState: signedOut });
    const v = await visitor.newPage();
    await v.goto(`/join/${token}`);
    await expect(v.getByRole("heading", { name: /Dawn Patrol/ })).toBeVisible();
    await expect(v.locator(".shell-bottomnav")).toHaveCount(0);
    await expect(v.getByRole("link", { name: "Create an account" })).toBeVisible();
    await visitor.close();
  });

  test("a covenant change waiting for my answer is marked in /groups and the switcher", async ({ page }) => {
    const owner = await newMember("needs-answer-owner");
    const groupId = await createGroupAs(owner, "Steady Hearts");
    const { token } = await createInviteAs(owner, groupId);
    const me = await apiAs(await signInNewMember(page, "needs-answer"));
    await joinAs(me, token);
    const { error } = await owner.client.rpc("change_group_covenant", {
      p_group: groupId,
      p_covenant_text: "We text each other every evening, without fail or excuse.",
      p_min_share_level: "full",
      p_leaderboard_hiding_allowed: false,
    });
    expect(error).toBeNull();
    await page.goto("/groups");
    await expect(page.getByText("A covenant change needs your answer")).toBeVisible();
    await page.locator(".group-switcher:visible summary").click();
    await expect(page.locator(".group-switcher:visible").getByText("Needs your answer").first()).toBeAttached();
  });
});

test.describe("Check-in pages are accessible", () => {
  test.use({ storageState: signedOut });

  for (const theme of themes) {
    test(`no axe violations on the check-in pages (${theme})`, async ({ page, context, baseURL }) => {
      await setTheme(context, baseURL!, theme);
      const me = await apiAs(await signInNewMember(page, `checkin-a11y-${theme}`));
      await seedCleanDays(me.userId, [6, 5, 4, 3, 2]);
      const groupId = await createGroupAs(me, "Quiet Streams");
      await page.goto("/check-in");
      await page.getByText("Add how it went (optional)").click();
      await expectNoAxeViolations(page, `/check-in (${theme})`);
      await page.getByRole("group", { name: "Mood" }).getByLabel("Okay").check();
      await page.getByRole("group", { name: "Strongest urge" }).getByLabel("Strong", { exact: true }).check();
      await page.getByRole("button", { name: "I stayed free today" }).click();
      await expect(page).toHaveURL(/\/check-in\/done/);
      await expectNoAxeViolations(page, `/check-in/done (${theme})`);
      await page.goto("/check-in");
      await expectNoAxeViolations(page, `/check-in answered (${theme})`);
      await page.getByText("Change your answer").click();
      await page.getByRole("button", { name: "I slipped" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "His mercies are new every morning" })).toBeVisible();
      await expectNoAxeViolations(page, `/check-in/done after a slip (${theme})`);
      for (const path of ["/home", "/progress", "/progress?range=90", `/groups/${groupId}`]) {
        await page.goto(path);
        await expectNoAxeViolations(page, `${path} (${theme})`);
      }
    });
  }

  test("reflow at 320px with no sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const me = await apiAs(await signInNewMember(page, "checkin-320"));
    await seedCleanDays(me.userId, [4, 3, 2]);
    const groupId = await createGroupAs(me, "A Rather Long Group Name For Small Screens");
    await page.goto("/check-in");
    await page.getByText("Add how it went (optional)").click();
    await noOverflow(page, "/check-in");
    await page.getByRole("group", { name: "Anything that played a part?" }).getByLabel("Alone with my phone").check();
    await page.getByRole("button", { name: "I slipped" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "His mercies are new every morning" })).toBeVisible();
    for (const path of ["/check-in/done", "/check-in", "/home", "/progress", `/groups/${groupId}`]) {
      if (path !== "/check-in/done") await page.goto(path);
      await noOverflow(page, path);
    }
  });

  test("keyboard only: answer with Tab and Enter", async ({ page }) => {
    await signInNewMember(page, "checkin-keyboard");
    await page.goto("/check-in");
    const clean = page.getByRole("button", { name: "I stayed free today" });
    for (let i = 0; i < 40 && !(await clean.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(clean).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/check-in\/done/);
  });
});
