import { expect, type Page } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test, testClientIp } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

// Phase 8a: the SOS sheet, the journal, resources and the on-device crisis
// card (CLAUDE.md §7.9; D-106 to D-109). The database rules are proven in
// pgTAP 100; here we check the "done when" items in a real browser.

async function openSos(page: Page) {
  await page.getByRole("button", { name: "SOS" }).click();
  const sheet = page.getByRole("dialog", { name: "Take a breath" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("SOS", () => {
  test.use({ storageState: signedOut });
  test.describe.configure({ timeout: 120_000 });

  test("opens in one tap from every kind of screen, and works by keyboard", async ({ page }) => {
    await signInNewMember(page, "sos-everywhere");
    for (const path of ["/home", "/groups", "/check-in", "/alerts", "/me", "/settings", "/journal", "/resources"]) {
      await page.goto(path);
      const sheet = await openSos(page);
      await expect(sheet.getByRole("heading", { name: "Breathe for a minute" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }
    // Keyboard only: focus the button, open, and the sheet's first control is reachable.
    await page.goto("/home");
    await page.getByRole("button", { name: "SOS" }).focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Take a breath" });
    await expect(sheet).toBeVisible();
    await expectNoAxeViolations(page, "sos sheet");
  });

  test("onboarding has the SOS button too", async ({ page }) => {
    await signInNewMember(page, "sos-onboarding", { onboarded: false });
    await expect(page).toHaveURL(/\/welcome$/);
    await openSos(page);
  });

  test("breathing: never starts by itself, pauses, and stands still under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signInNewMember(page, "sos-breathe");
    const sheet = await openSos(page);
    const words = sheet.getByTestId("breath-words");
    await expect(words).toBeEmpty();
    await sheet.getByRole("button", { name: "Start breathing" }).click();
    await expect(words).toContainText("Breathe in");
    await expect(words).toContainText("Breath 1 of 4");
    // Reduced motion: the circle doesn't animate.
    const animation = await sheet.locator(".breath__circle").evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe("none");
    // Screen readers hear one polite line per breath.
    await expect(sheet.getByTestId("sos-live")).toContainText("Breath 1 of 4");
    await expect(sheet.getByTestId("sos-live")).toHaveAttribute("aria-live", "polite");
    // Step on by hand.
    await sheet.getByRole("button", { name: "Next step" }).click();
    await expect(words).toContainText("Hold");
    await sheet.getByRole("button", { name: "Pause" }).first().click();
    await expect(sheet.getByRole("button", { name: "Keep breathing" })).toBeVisible();
    // Only one role=status on the page (the sheet uses a plain polite region).
    expect(await page.locator("[role=status]").count()).toBeLessThanOrEqual(1);
  });

  test("the timer and the tally never show or count a failure", async ({ page }) => {
    const me = await signInNewMember(page, "sos-wave");
    const sheet = await openSos(page);
    await sheet.getByRole("button", { name: "Start the ten minutes" }).click();
    await expect(sheet.getByTestId("wave-clock")).toContainText(/(10:00|9:5\d) left/);
    await sheet.getByRole("button", { name: "Stop" }).click();
    await expect(sheet.locator(".sos-gentle").getByText("That’s okay. You reached out.")).toBeVisible();
    await expect(sheet.locator("#sos-wave").getByText(/fail|reset|broke/i)).toHaveCount(0);

    await sheet.getByRole("button", { name: "I made it through" }).click();
    await expect(sheet.locator(".sos-gentle").getByText("Counted. Thank you for staying.")).toBeVisible();
    await expect(sheet.getByTestId("sos-tally")).toHaveText("You’ve ridden out 1 wave. Only you can see this.");
    await sheet.getByRole("button", { name: "I made it through" }).click();
    await expect(sheet.getByTestId("sos-tally")).toHaveText("You’ve ridden out 2 waves. Only you can see this.");
    const { data } = await admin().from("recovery_tallies").select("*").eq("user_id", me.userId).single();
    expect(data).toEqual({ user_id: me.userId, waves: 2, updated_at: expect.any(String) });
  });

  test("reach out: call my partner, let them know, ask my group to pray", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "sos-me"));
    await admin().from("profiles").update({ display_name: "Sam Seeker" }).eq("id", me.userId);
    const groupId = await createGroupAs(me, "Reach Out");
    const { token } = await createInviteAs(me, groupId);
    const partner = await newMember("sos-partner");
    await admin().from("profiles").update({ display_name: "Pat Partner" }).eq("id", partner.userId);
    await joinAs(partner, token, "full");
    const { data: pid, error } = await me.client.rpc("request_partner", { p_group: groupId, p_user: partner.userId });
    if (error) throw error;
    await partner.client.rpc("respond_partner", { p_partnership: pid as string, p_accept: true });

    // No number yet, and alerts not allowed yet.
    await page.goto("/home");
    let sheet = await openSos(page);
    await expect(sheet.getByText("Pat Partner hasn’t shared a number yet.")).toBeVisible();
    await expect(sheet.getByText(/first allow alerts/)).toBeVisible();
    await page.keyboard.press("Escape");

    // The partner shares a number through the real Settings form; I allow alerts.
    // Its own made-up address, like every test page, so the per-IP sign-in limit isn't shared.
    const partnerPage = await page
      .context()
      .browser()!
      .newPage({ storageState: signedOut, extraHTTPHeaders: { "x-forwarded-for": testClientIp() } });
    await partnerPage.goto("/sign-in");
    await partnerPage.locator("#email").fill(partner.email);
    await partnerPage.locator("#current-password").fill(partner.password);
    await partnerPage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(partnerPage).toHaveURL(/\/home$/);
    await partnerPage.goto("/settings");
    await partnerPage.getByLabel("Phone or WhatsApp number").fill("+91 98765 43210");
    await partnerPage.getByRole("button", { name: "Save number" }).click();
    await expect(partnerPage.getByText("Saved. Your active partners can call you now.")).toBeVisible();
    await partnerPage.close();
    const { data: stored } = await admin()
      .from("partner_contacts")
      .select("phone_encrypted")
      .eq("user_id", partner.userId)
      .single();
    expect(stored?.phone_encrypted).toMatch(/^v1:/);
    expect(stored?.phone_encrypted).not.toContain("98765");
    await me.client.rpc("set_partner_alerts", { p_partnership: pid as string, p_allow: true });

    await page.goto("/home");
    sheet = await openSos(page);
    await expect(sheet.getByRole("link", { name: "Call Pat Partner" })).toHaveAttribute("href", "tel:+919876543210");
    await expect(sheet.getByRole("link", { name: "Message Pat Partner on WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/919876543210",
    );
    await sheet.getByRole("button", { name: "Let my partners know" }).click();
    await expect(sheet.locator(".sos-gentle").getByText("Your partners know. Someone is with you.")).toBeVisible();
    const url = page.url();

    await sheet.getByRole("button", { name: "Ask for prayer" }).click();
    await expect(sheet.locator(".sos-gentle").getByText("Your prayer request is on your group’s wall.")).toBeVisible();
    // Nothing about it reached the address.
    expect(page.url()).toBe(url);
    const { data: posts } = await admin().from("posts").select("kind, body").eq("group_id", groupId);
    expect(posts).toContainEqual({ kind: "prayer_request", body: "Please pray for me today." });
  });

  test("works offline: a page that can't load shows the SOS tools", async ({ page, context }) => {
    test.skip(test.info().project.name === "mobile", "One run is enough for the service worker");
    await signInNewMember(page, "sos-offline");
    await page.goto("/home");
    // The app registers the worker and it keeps a copy of /breathe.
    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.getRegistration("/");
        if (!reg?.active) return false;
        const cache = await caches.open("ha-offline-v1");
        return Boolean(await cache.match("/breathe"));
      },
      undefined,
      { timeout: 30_000 },
    );
    // Offline, the SOS sheet on an open page still works...
    await context.setOffline(true);
    const sheet = await openSos(page);
    await sheet.getByRole("button", { name: "Start breathing" }).click();
    await expect(sheet.getByTestId("breath-words")).toContainText("Breathe in");
    await expect(sheet.getByText(/You’re offline right now/)).toBeVisible();
    await page.keyboard.press("Escape");
    // ...and a page that can't load shows the offline copy.
    await page.goto("/groups");
    await expect(page.getByRole("heading", { level: 1, name: "Take a breath" })).toBeVisible();
    await expect(page.getByText("You’re offline, but you’re not alone.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Start breathing" }).click();
    await expect(page.getByTestId("breath-words")).toContainText("Breathe in");
    await context.setOffline(false);
  });
});

test.describe("Journal", () => {
  test.use({ storageState: signedOut });

  test("entries are encrypted, only mine, and the address never changes with a result", async ({ page, browser }) => {
    const me = await signInNewMember(page, "journal-me");
    await page.goto("/journal");
    await expect(page).toHaveTitle(/^Journal \|/);
    await page.getByLabel("Your entry").fill("Today was hard, but I called a friend.");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await expect(page.getByText("Saved. Only you can read it.")).toBeVisible();
    await expect(page.getByText("Today was hard, but I called a friend.")).toBeVisible();
    await expectNoAxeViolations(page, "journal");

    // The database console sees only ciphertext.
    const { data: rows } = await admin().from("journal_entries").select("id, body_encrypted").eq("user_id", me.userId);
    expect(rows).toHaveLength(1);
    expect(rows![0]!.body_encrypted).toMatch(/^v1:/);
    expect(rows![0]!.body_encrypted).not.toContain("hard");
    const id = rows![0]!.id;

    // Edit, then delete.
    await page.getByRole("link", { name: /^Open/ }).click();
    await expect(page).toHaveURL(new RegExp(`/journal/${id}$`));
    await page.getByLabel("Your entry").fill("Today was hard. I called a friend, and it helped.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/journal/${id}$`));
    await expect(page.getByText("Saved. Only you can read it.")).toBeVisible();
    await expectNoAxeViolations(page, "journal entry");

    // Someone else, even knowing the address, gets nothing.
    const other = await browser.newPage({
      storageState: signedOut,
      extraHTTPHeaders: { "x-forwarded-for": testClientIp() },
    });
    await signInNewMember(other, "journal-other");
    const response = await other.goto(`/journal/${id}`);
    expect(response?.status()).toBe(404);
    await other.close();

    await page.getByText("Delete this entry").first().click();
    await page.getByRole("button", { name: "Delete this entry" }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await expect(page.getByText("Deleted.")).toBeVisible();
    const { count } = await admin()
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me.userId);
    expect(count).toBe(0);
  });

  test("self-harm words gently show crisis lines, on the device only, and saving still works", async ({ page }) => {
    await signInNewMember(page, "journal-crisis");
    await page.goto("/journal");
    // Anything sent while typing (link prefetches are GETs that carry no text).
    const sent: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET" || /die/i.test(r.url())) sent.push(`${r.method()} ${r.url()}`);
    });
    await page.getByLabel("Your entry").fill("Some days I just want to die.");
    const card = page.getByTestId("crisis-card");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "You don’t have to carry this alone" })).toBeVisible();
    await expect(card.getByRole("link", { name: /Tele-MANAS \(India\), 14416/ })).toHaveAttribute("href", "tel:14416");
    // Typing sent nothing anywhere.
    expect(sent).toEqual([]);
    await expectNoAxeViolations(page, "journal crisis card");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByText("Saved. Only you can read it.")).toBeVisible();
  });
});

test.describe("Resources", () => {
  test.use({ storageState: signedOut });

  test("crisis lines with my own country first, and every line can be called", async ({ page }) => {
    await signInNewMember(page, "resources-me");
    await page.goto("/resources");
    await expect(page).toHaveTitle(/^Resources \|/);
    const lines = page.locator(".crisis-line");
    // Test accounts are in Asia/Kolkata: India first.
    await expect(lines.first()).toContainText("India");
    await expect(lines.first().getByRole("link")).toHaveAttribute("href", "tel:14416");
    await expect(
      page.getByRole("link", { name: "Somewhere else? Find a line near you at findahelpline.com." }),
    ).toHaveAttribute("href", "https://findahelpline.com");
    await expect(page.getByText("is not a medical service", { exact: false })).toBeVisible();
  });
});
