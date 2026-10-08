import { readFile } from "node:fs/promises";

import { expect } from "@playwright/test";

import { readZip } from "../../src/lib/zip";
import { expectNoAxeViolations, setTheme, signedOut, test, themes } from "./fixtures";
import { signInNewMember } from "./support/session";
import { admin, findUserId, waitForEmail } from "./support/supabase";

// Phase 2e: "Download my data" and deleting an account (D-032, D-033).

const sensitive = /porn|fap|lust|relapse|addiction|masturbat|streak|sexual|temptation/i;
const decode = (b: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);
const cronSecret = process.env.CRON_SECRET ?? "";

test.describe("Download my data", () => {
  test.use({ storageState: signedOut });

  test("downloads one zip with JSON, CSVs and the private note, and no secrets", async ({ page }) => {
    const { email, userId } = await signInNewMember(page, "export", { onboarded: false });

    // Something private to export: "my why", through the real onboarding form.
    await page.goto("/welcome?step=why");
    const why = "So I can be present for the people I love, = and free.";
    await page.getByLabel("My why (optional)").fill(why);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/step=reminder$/);
    await page.getByRole("button", { name: "Skip setup" }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/settings");
    await page.getByRole("link", { name: "Open your data" }).click();
    await expect(page).toHaveURL(/\/settings\/data$/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^holy-auramaxing-data-\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = new Uint8Array(await readFile((await download.path())!));
    const entries = new Map(readZip(zip).map((e) => [e.path, decode(e.data)]));

    for (const path of [
      "README.txt",
      "data.json",
      "csv/account.csv",
      "csv/profile.csv",
      "csv/privacy_settings.csv",
      "csv/notification_settings.csv",
      "csv/my_why.csv",
      "csv/consents.csv",
      "csv/devices.csv",
      "csv/security_events.csv",
    ]) {
      expect(entries.has(path), path).toBe(true);
    }

    const json = JSON.parse(entries.get("data.json")!) as {
      format: string;
      sections: Record<string, Record<string, unknown>[]>;
    };
    expect(json.format).toBe("holy-auramaxing-data-export");
    expect(json.sections.account?.[0]).toMatchObject({ email, sign_in_methods: "email", two_step_sign_in: false });
    expect(json.sections.my_why?.[0]?.my_why).toBe(why);
    expect(json.sections.consents?.map((c) => c.kind).sort()).toEqual(["sensitive_data", "terms_privacy"]);
    expect(json.sections.devices?.some((d) => d.this_device === true)).toBe(true);
    expect(json.sections.security_events?.some((e) => e.event === "auth.sign_in")).toBe(true);
    // The CSV defuses spreadsheet formulas but keeps the text.
    expect(entries.get("csv/my_why.csv")).toContain("So I can be present");

    // Nothing secret, and nothing that points at another person.
    const everything = [...entries.values()].join("\n");
    expect(everything).not.toMatch(/encrypted_password|code_hash|my_why_encrypted|refresh_token|access_token/);
    expect(everything).not.toMatch(/v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:/);
    expect(everything).not.toContain(process.env.SUPABASE_SECRET_KEY ?? "never-empty");
    expect(entries.get("README.txt")).not.toMatch(sensitive);

    // The export itself is a security event.
    const { data: events } = await admin()
      .from("audit_log")
      .select("action")
      .eq("actor_id", userId)
      .eq("action", "account.exported");
    expect(events?.length).toBe(1);
  });

  test("refuses other sites and signed-out visitors", async ({ request, baseURL }) => {
    // Another site posting the form (CSRF).
    const crossSite = await request.post("/api/account/export", {
      headers: { Origin: "https://evil.example" },
      form: { from: "settings" },
      maxRedirects: 0,
    });
    expect(crossSite.status()).toBe(403);

    // Same site, but nobody signed in.
    const signedOutPost = await request.post("/api/account/export", {
      headers: { Origin: baseURL! },
      form: { from: "settings" },
      maxRedirects: 0,
    });
    expect(signedOutPost.status()).toBe(303);
    expect(signedOutPost.headers().location).toMatch(/\/sign-in$/);

    // A GET is not a download.
    const get = await request.get("/api/account/export", { maxRedirects: 0 });
    expect(get.status()).toBe(405);
  });
});

test.describe("Deleting an account", () => {
  test.use({ storageState: signedOut });

  test("asks once, closes the account for 14 days, and Keep my account undoes it", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { email, password, userId } = await signInNewMember(page, "delete-keep");

    // A second device, signed in too.
    const laptop = await browser.newContext({ baseURL });
    const other = await laptop.newPage();
    await other.goto("/sign-in");
    await other.locator("#email").fill(email);
    await other.locator("#current-password").fill(password);
    await other.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(other).toHaveURL(/\/home$/);

    await page.goto("/settings/data");
    await page.getByRole("link", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/settings\/data\/delete$/);

    // Without the tick: one clear message, linked to the box.
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/error=confirm#delete-errors$/);
    const summary = page.getByRole("alert").filter({ hasText: "Please check the following" });
    await expect(summary).toBeVisible();
    await summary.getByRole("link", { name: /Tick the box/ }).click();
    await expect(page.getByLabel(/after 14 days my account is deleted for good/)).toBeFocused();
    const { data: untouched } = await admin()
      .from("profiles")
      .select("deletion_requested_at")
      .eq("id", userId)
      .single();
    expect(untouched?.deletion_requested_at).toBeNull();

    await page.getByLabel(/after 14 days my account is deleted for good/).check();
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/account-closing\?notice=requested$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your account is closing" })).toBeVisible();
    await expect(page.getByText(/It will be deleted for good on/)).toBeVisible();

    // A discreet email with the date.
    const closing = await waitForEmail(email, /will close on/);
    expect(closing.from).toMatch(/^Holy Auramaxing </);
    expect(`${closing.subject} ${closing.html} ${closing.text}`).not.toMatch(sensitive);

    // The rest of the app is closed; the other device was signed out.
    await page.goto("/home");
    await expect(page).toHaveURL(/\/account-closing$/);
    await other.goto("/settings");
    await expect(other).toHaveURL(/\/sign-in/);
    await laptop.close();

    // Signing in again during the 14 days lands on the same page.
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#current-password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/account-closing$/);

    await page.getByRole("button", { name: "Keep my account" }).click();
    await expect(page).toHaveURL(/\/settings\/data\?notice=account-kept$/);
    await expect(page.getByRole("status").filter({ hasText: "Welcome back" })).toBeVisible();
    await page.goto("/home");
    await expect(page).toHaveURL(/\/home$/);

    const kept = await waitForEmail(email, /will stay open/);
    expect(`${kept.subject} ${kept.html} ${kept.text}`).not.toMatch(sensitive);

    const { data: events } = await admin().from("audit_log").select("action").eq("actor_id", userId);
    const actions = (events ?? []).map((e) => e.action);
    expect(actions).toContain("account.deletion_requested");
    expect(actions).toContain("account.deletion_cancelled");
  });

  test("after 14 days the account, its data and its photo files are gone", async ({ page, request }) => {
    test.skip(cronSecret.length < 32, "Needs CRON_SECRET in .env.local");
    const { email, password, userId } = await signInNewMember(page, "delete-erase");
    const db = admin();

    // A stored photo, as the avatar pipeline would leave it.
    const file = `${userId}/${"a".repeat(32)}-512.webp`;
    const { error: uploadError } = await db.storage
      .from("avatars")
      .upload(file, new Uint8Array([82, 73, 70, 70]), { contentType: "image/webp" });
    expect(uploadError).toBeNull();

    await page.goto("/settings/data/delete");
    await page.getByLabel(/after 14 days my account is deleted for good/).check();
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/account-closing/);

    // Fifteen days pass.
    const { error: backdateError } = await db
      .from("profiles")
      .update({ deletion_requested_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() })
      .eq("id", userId);
    expect(backdateError).toBeNull();

    // The purge route needs its secret.
    expect((await request.get("/api/cron/account-purge")).status()).toBe(401);
    expect(
      (await request.get("/api/cron/account-purge", { headers: { Authorization: "Bearer wrong" } })).status(),
    ).toBe(401);

    const run = await request.get("/api/cron/account-purge", { headers: { Authorization: `Bearer ${cronSecret}` } });
    expect(run.status()).toBe(200);
    const result = (await run.json()) as { erased: number; foldersEmptied: number };
    expect(result.erased).toBeGreaterThanOrEqual(1);
    expect(result.foldersEmptied).toBeGreaterThanOrEqual(1);

    expect(await findUserId(email)).toBeUndefined();
    const { data: profile } = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
    expect(profile).toBeNull();
    const { data: files } = await db.storage.from("avatars").list(userId);
    expect(files ?? []).toEqual([]);
    const { data: linked } = await db.from("audit_log").select("id").or(`actor_id.eq.${userId},target_id.eq.${userId}`);
    expect(linked).toEqual([]);

    // This browser's session died with the account.
    await page.goto("/home");
    await expect(page).toHaveURL(/\/sign-in/);

    // And the old password no longer signs in.
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#current-password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/don’t match/)).toBeVisible();
  });
});

for (const theme of themes) {
  test.describe(`axe, account deletion, ${theme} theme`, () => {
    test.use({ storageState: signedOut });

    test("the delete page with its error and the account-closing page have no violations", async ({
      page,
      context,
      baseURL,
    }) => {
      await setTheme(context, baseURL!, theme);
      await signInNewMember(page, `delete-axe-${theme}`);
      await page.goto("/settings/data/delete?error=confirm#delete-errors");
      await expectNoAxeViolations(page, `delete page with error (${theme})`);

      await page.getByLabel(/after 14 days my account is deleted for good/).check();
      await page.getByRole("button", { name: "Delete my account" }).click();
      await expect(page).toHaveURL(/\/account-closing/);
      await expectNoAxeViolations(page, `account-closing (${theme})`);
    });
  });
}

test.describe("keyboard", () => {
  test.use({ storageState: signedOut });

  test("deleting and keeping the account works with only a keyboard", async ({ page }) => {
    await signInNewMember(page, "delete-keyboard");
    await page.goto("/settings/data/delete");

    const box = page.getByLabel(/after 14 days my account is deleted for good/);
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/account-closing/);

    const keep = page.getByRole("button", { name: "Keep my account" });
    await keep.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/notice=account-kept$/);
  });
});
