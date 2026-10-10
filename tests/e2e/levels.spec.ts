import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 5a: levels, missed days and late offline check-ins (CLAUDE.md §7.5,
// §7.6; D-063 to D-067). The level rules themselves are in pgTAP 050 and 051.

/** Test accounts live in Asia/Kolkata (support/supabase.ts). */
function kolkataDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

/** Clean days `from` to `to` days ago, written straight into the table as history. */
async function seedCleanRun(userId: string, from: number, to = 1) {
  const rows = [];
  for (let n = from; n >= to; n -= 1) {
    rows.push({ user_id: userId, local_date: kolkataDate(-n), timezone: "Asia/Kolkata", outcome: "clean" });
  }
  const { error } = await admin().from("checkins").insert(rows);
  if (error) throw error;
  // The account "started" before the seeded history.
  const { error: e2 } = await admin()
    .from("profiles")
    .update({ created_at: new Date(Date.now() - (from + 2) * 86_400_000).toISOString() })
    .eq("id", userId);
  if (e2) throw e2;
}

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(0);
}

test.describe("Levels", () => {
  test.use({ storageState: signedOut });

  test("the level card, a level-up into a new era, and the share card", async ({ page, baseURL }) => {
    const me = await signInNewMember(page, "levels-up");

    // No check-ins yet: Level 0.
    await page.goto("/home");
    const card = page.getByRole("region", { name: "Clay" });
    await expect(card).toContainText("Level 0 · Beginning");
    await expect(card).toContainText("Everyone starts as Clay.");
    await expect(card.getByRole("link", { name: "Save a picture of your level" })).toHaveCount(0);

    // 24 free days of history, then today: 25 days, Level 5, a new era.
    await seedCleanRun(me.userId, 24);
    await page.goto("/check-in");
    await page.getByRole("button", { name: "I stayed free today" }).click();
    await expect(page).toHaveURL(/\/check-in\/done\?date=/);
    await expect(page.getByRole("heading", { name: "A new chapter: Genesis" })).toBeVisible();
    await expect(page.getByText("You’re now Breath of Life Ultra, and a new part of the story begins.")).toBeVisible();
    await expectNoAxeViolations(page, "level-up");

    await page.goto("/home");
    const level = page.getByRole("region", { name: "Breath of Life Ultra" });
    await expect(level).toContainText("Level 5 · Genesis");
    await expect(level).toContainText("0 of 5 days to Breath of Life Ultra Pro Max");
    await expect(level).toContainText("Genesis 2:7 (WEB)");
    await expect(level).toContainText("breathed into his nostrils the breath of life");
    await expect(page.getByRole("progressbar", { name: "Progress to the next level" })).toHaveAttribute(
      "aria-valuetext",
      "0 of 5 days to Breath of Life Ultra Pro Max",
    );
    await expectNoAxeViolations(page, "home with level");
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page, "home at 320px");

    // The share card: a PNG, private, never cached.
    const share = await page.request.get(`${baseURL}/api/share/level`);
    expect(share.status()).toBe(200);
    expect(share.headers()["content-type"]).toBe("image/png");
    expect(share.headers()["cache-control"]).toContain("no-store");
    const png = await share.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });

  test("a slip that drops the level gets one quiet line", async ({ page }) => {
    const me = await signInNewMember(page, "levels-down");
    await seedCleanRun(me.userId, 24);
    // Today answered "stayed free" first: 25 days, Level 5.
    const api = await apiAs(me);
    const { error } = await api.client.rpc("submit_checkin", { p_local_date: kolkataDate(), p_outcome: "clean" });
    if (error) throw error;
    // Then changed to an honest slip.
    await page.goto("/check-in");
    await page.getByText("Change your answer").click();
    await page.getByRole("button", { name: "I slipped" }).click();
    await expect(page).toHaveURL(/\/check-in\/done\?date=/);
    await expect(
      page.getByText("You’re now Clay. Your longest streak and total free days are still yours."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /new chapter|You reached/ })).toHaveCount(0);
    await expectNoAxeViolations(page, "level-down");
  });

  test("a group sees a level only from members who share their streak there", async ({ page }) => {
    const owner = await apiAs(await signInNewMember(page, "levels-group-owner"));
    const groupId = await createGroupAs(owner, "Level Watch");
    const { token } = await createInviteAs(owner, groupId);
    const quiet = await newMember("levels-quiet");
    const shown = await newMember("levels-shown");
    await joinAs(quiet, token, "checkin_only");
    await joinAs(shown, token, "streak");
    for (const m of [quiet, shown]) {
      await seedCleanRun(m.userId, 10);
      const { error } = await m.client.rpc("submit_checkin", { p_local_date: kolkataDate(), p_outcome: "clean" });
      if (error) throw error;
    }

    await page.goto(`/groups/${groupId}`);
    const today = page.getByRole("region", { name: "Today" });
    // Both have 11 free days (Level 2); only one level shows.
    await expect(today.getByText("Level 2")).toHaveCount(1);
    const { data } = await owner.client.from("group_checkins_today").select("user_id, level").eq("group_id", groupId);
    expect(data?.find((r) => r.user_id === quiet.userId)?.level).toBeNull();
    expect(data?.find((r) => r.user_id === shown.userId)?.level).toBe(2);
    const { data: cards } = await owner.client
      .from("profile_cards")
      .select("id, level")
      .in("id", [quiet.userId, shown.userId]);
    expect(cards?.find((c) => c.id === quiet.userId)?.level).toBeNull();
    expect(cards?.find((c) => c.id === shown.userId)?.level).toBe(2);
  });
});

test.describe("Offline check-ins sent later", () => {
  test.use({ storageState: signedOut });

  test("one made two days ago counts; too old, cross-site or invalid ones are refused", async ({ page, baseURL }) => {
    const me = await signInNewMember(page, "offline-sync");
    await seedCleanRun(me.userId, 10, 3);
    const url = `${baseURL}/api/checkins/sync`;
    const headers = { origin: baseURL ?? "", "content-type": "application/json" };
    // 20:00 in India, two days ago: inside that day's window when it was made.
    const twoDaysAgo = kolkataDate(-2);
    const recordedAt = `${twoDaysAgo}T14:30:00Z`;

    const late = await page.request.post(url, {
      headers,
      data: { date: twoDaysAgo, recordedAt, outcome: "clean", note: "on the train" },
    });
    expect(late.status()).toBe(200);
    expect(await late.json()).toEqual({ status: "synced_late" });
    const { data: row } = await admin()
      .from("checkins")
      .select("outcome, note_encrypted")
      .eq("user_id", me.userId)
      .eq("local_date", twoDaysAgo)
      .single();
    expect(row?.outcome).toBe("clean");
    expect(row?.note_encrypted).toMatch(/^v1:/);
    const { data: audit } = await admin()
      .from("audit_log")
      .select("metadata")
      .eq("actor_id", me.userId)
      .eq("action", "checkin.synced_late");
    expect(audit).toEqual([{ metadata: { local_date: twoDaysAgo } }]);

    // The same day again: answered already, so the device can forget it.
    const again = await page.request.post(url, { headers, data: { date: twoDaysAgo, recordedAt, outcome: "slipped" } });
    expect(again.status()).toBe(409);
    expect(await again.json()).toEqual({ error: "alreadyAnswered", drop: true });

    // Made nine days ago: past the 7-day limit.
    const nineDaysAgo = kolkataDate(-9);
    const old = await page.request.post(url, {
      headers,
      data: { date: nineDaysAgo, recordedAt: `${nineDaysAgo}T14:30:00Z`, outcome: "clean" },
    });
    expect(await old.json()).toEqual({ error: "syncTooOld", drop: true });

    // Claiming a day outside its own window.
    const outside = await page.request.post(url, {
      headers,
      data: { date: kolkataDate(-5), recordedAt, outcome: "clean" },
    });
    expect(await outside.json()).toEqual({ error: "windowClosed", drop: true });

    // Not JSON we understand.
    const junk = await page.request.post(url, { headers, data: { date: "yesterday" } });
    expect(junk.status()).toBe(400);

    // Another site can't send one (CSRF).
    const cross = await page.request.post(url, {
      headers: { ...headers, origin: "https://evil.example" },
      data: { date: kolkataDate(), recordedAt: new Date().toISOString(), outcome: "clean" },
    });
    expect(cross.status()).toBe(403);
  });
});

test.describe("Grace review 1 wording", () => {
  test("SOS speaks to someone who already slipped; the delete page to someone leaving on a hard day", async ({
    page,
  }) => {
    await page.goto("/home");
    await page.getByRole("button", { name: "SOS" }).click();
    const sheet = page.getByRole("dialog", { name: "Take a breath" });
    await sheet.getByText("Already slipped? There’s grace for that too.").click();
    await expect(sheet).toContainText("If we confess our sins, he is faithful and righteous to forgive us the sins");
    await expectNoAxeViolations(page, "SOS after a slip");
    await sheet.getByRole("link", { name: "Go to your check-in" }).click();
    await expect(page).toHaveURL(/\/check-in$/);
    await expect(sheet).toBeHidden();

    await page.goto("/settings/data/delete");
    await expect(page.getByText("nothing you’ve done closes this door")).toBeVisible();
  });
});
