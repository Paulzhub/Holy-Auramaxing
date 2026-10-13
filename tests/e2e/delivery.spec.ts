import { expect } from "@playwright/test";

import { expectNoAxeViolations, signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";
import { admin, listEmails, mailpitUrl, waitForEmail } from "./support/supabase";

// Phase 7c: push and email delivery (CLAUDE.md §7.8, D-092). The database
// calls the app's sender through pg_net (pgTAP 092 covers claiming, results,
// gone subscriptions and unsubscribing); here a real email goes from an
// event, through the queue, the planner and the sender, into Mailpit, with a
// neutral subject, discreet words and one-click unsubscribe that works. Push
// itself needs a real push service (Phase 10's device checks); here we check
// the explainer, the iOS guide and the settings switch.

const PORT = Number(process.env.E2E_PORT ?? 3100);

// The full Chromium, not Playwright's default headless shell: the shell
// reports notifications as already denied, so a real browser's "not asked
// yet" (and the explainer) never appears there.
test.use({ channel: "chromium" });

test.describe("Delivery", () => {
  test.use({ storageState: signedOut });
  test.describe.configure({ timeout: 150_000 });

  test.beforeAll(async () => {
    // Where pg_net (in the database's container) finds this app.
    const secret = process.env.CRON_SECRET ?? "";
    expect(secret.length, "CRON_SECRET in .env.local").toBeGreaterThanOrEqual(32);
    const { error } = await admin().rpc("notify_configure", {
      p_url: `http://host.docker.internal:${PORT}/api/notify/deliver`,
      p_secret: secret,
    });
    expect(error).toBeNull();
  });

  test("an announcement reaches an email inbox discreetly, and one click stops it", async ({ page, request }) => {
    const owner = await newMember("dl-owner");
    const groupId = await createGroupAs(owner, "NoFap Morning Light");
    const { token } = await createInviteAs(owner, groupId);
    const friend = await newMember("dl-friend");
    await joinAs(friend, token, "full");

    // Quiet hours (22:00–07:00 in the test accounts' Asia/Kolkata by default)
    // would rightly hold the email back when CI runs in the evening, so the
    // friend's are moved to an hour twelve hours from now.
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(
        new Date(),
      ),
    );
    const at = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
    const { error: quietError } = await friend.client.rpc("update_notification_settings", {
      p_quiet_start: at(hour + 12),
      p_quiet_end: at(hour + 13),
      p_digest: "off",
      p_discreet: true,
      p_sound: true,
      p_vibrate: true,
    });
    expect(quietError).toBeNull();

    // The friend chose email for announcements.
    const { error: prefError } = await friend.client.rpc("set_notification_preferences", {
      p_prefs: [{ type: "announcement", channel: "email", enabled: true }],
    });
    expect(prefError).toBeNull();
    const { error: postError } = await owner.client.rpc("create_post", {
      p_group: groupId,
      p_kind: "announcement",
      p_body: "Prayer meeting moved to Friday.",
    });
    expect(postError).toBeNull();

    const email = await waitForEmail(friend.email, /^You have a new update$/, 60_000);
    expect(email.from).toMatch(/^Holy Auramaxing </);
    expect(email.text).toContain("There’s something new in your group");
    // Nobody's words, and never the group's name.
    expect(email.text).not.toContain("NoFap");
    expect(email.text).not.toContain("Prayer meeting");
    expect(email.html).not.toContain("NoFap");

    // RFC 8058 headers.
    const [summary] = await listEmails(friend.email, /^You have a new update$/);
    const headers = (await (await fetch(`${mailpitUrl}/api/v1/message/${summary!.ID}/headers`)).json()) as Record<
      string,
      string[]
    >;
    expect(headers["List-Unsubscribe-Post"]?.[0]).toBe("List-Unsubscribe=One-Click");
    const oneClick = /<(https?:\/\/[^>]+)>/.exec(headers["List-Unsubscribe"]?.[0] ?? "")?.[1];
    expect(oneClick).toMatch(/\/api\/notify\/unsubscribe\?u=/);

    // A GET (a link scanner) changes nothing.
    const scanned = await request.get(oneClick!.replace(/^https?:\/\/[^/]+/, ""), { maxRedirects: 0 });
    expect(scanned.status()).toBe(303);
    const still = await friend.client.from("notification_preferences").select("enabled").eq("type", "announcement");
    expect(still.data).toEqual([{ enabled: true }]);

    // The mail app's one click.
    const clicked = await request.post(oneClick!.replace(/^https?:\/\/[^/]+/, ""), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: "List-Unsubscribe=One-Click",
    });
    expect(clicked.status()).toBe(200);
    const after = await friend.client.from("notification_preferences").select("enabled").eq("type", "announcement");
    expect(after.data).toEqual([]);

    // A tampered link does nothing.
    const tampered = await request.post(
      oneClick!.replace(/^https?:\/\/[^/]+/, "").replace(/t=announcement/, "t=nudge"),
      { data: "List-Unsubscribe=One-Click" },
    );
    expect(tampered.status()).toBe(400);

    // The page for people: confirm, then done. No sign-in needed.
    const pageLink = /href="([^"]*\/unsubscribe\?[^"]+)"/.exec(email.html)?.[1]?.replace(/&amp;/g, "&");
    expect(pageLink).toBeTruthy();
    await page.goto(pageLink!.replace(/^https?:\/\/[^/]+/, ""));
    await expect(page.getByRole("heading", { name: "Stop these emails?" })).toBeVisible();
    await expect(page).toHaveTitle(/^Emails \|/);
    await expectNoAxeViolations(page, "unsubscribe");
    await page.setViewportSize({ width: 320, height: 720 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Stop these emails" }).click();
    await expect(page.getByRole("heading", { name: "Done. You won’t get these emails any more." })).toBeVisible();
  });

  test("the push explainer comes after a check-in, never on its own, and 'Not now' keeps it away", async ({ page }) => {
    const me = await apiAs(await signInNewMember(page, "dl-push"));
    await page.goto("/home");
    await expect(page.getByTestId("push-explainer")).toHaveCount(0);

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const { error } = await me.client.rpc("submit_checkin", { p_local_date: today, p_outcome: "clean" });
    expect(error).toBeNull();
    await page.goto(`/check-in/done?date=${today}`);
    const card = page.getByTestId("push-explainer");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "Hear from your group on this device?" })).toBeVisible();
    // No browser prompt yet: the permission is still unasked.
    expect(await page.evaluate(() => Notification.permission)).toBe("default");
    await expectNoAxeViolations(page, "check-in done with the push explainer");
    await card.getByRole("button", { name: "Not now" }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("push-explainer")).toHaveCount(0);

    // Settings: this device's switch.
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("push-control")).toContainText("Notifications are off for this device.");
    await expect(page.getByRole("button", { name: "Turn on notifications" })).toBeVisible();
  });

  test("on an iPhone, Safari shows how to add the app to the Home Screen first", async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    // Safari outside the Home Screen has no PushManager.
    await page.addInitScript(() => {
      delete (window as { PushManager?: unknown }).PushManager;
    });
    await signInNewMember(page, "dl-ios");
    await page.goto("/settings/notifications");
    const guide = page.getByTestId("ios-install");
    await expect(guide).toContainText("add the app to your Home Screen first");
    await expect(guide.getByRole("listitem")).toHaveCount(3);
    await expectNoAxeViolations(page, "iOS guide");
    await context.close();
  });

  test("the manifest gives the neutral name and the service worker is served fresh", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.name).toBe("Holy Auramaxing");
    expect(manifest.short_name).toBe("Holy Auramaxing");
    expect(manifest.display).toBe("standalone");
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    expect(sw.headers()["content-type"]).toContain("javascript");
  });
});
