import { type Page } from "@playwright/test";

import { GPS_CAMERA_MAKE, hasGpsExif, photoWithGps, stubRejectedPhoto } from "../../src/test/images";

import { expect, expectNoAxeViolations, setTheme, signedOut, test, themes } from "./fixtures";
import { signInNewMember } from "./support/session";
import { admin } from "./support/supabase";

/**
 * Profile page, editor and avatar pipeline (CLAUDE.md §7.3). Each test signs
 * in its own member. Photos are screened by the stand-in screener, which
 * approves everything except solid magenta (playwright.config.ts, D-026).
 */
test.use({ storageState: signedOut });

const photoFile = async () => ({ name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: await photoWithGps() });

async function avatarRow(userId: string) {
  const { data } = await admin()
    .from("profiles")
    .select("avatar_path, avatar_pending_path, avatar_status")
    .eq("id", userId)
    .single();
  return data!;
}

async function storedFiles(userId: string): Promise<string[]> {
  const { data } = await admin().storage.from("avatars").list(userId);
  return (data ?? []).map((f) => f.name).sort();
}

/** Picks a photo, accepts the crop, and waits until it is live. */
async function uploadThroughCropper(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel("Choose a photo").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Use this photo" }).click();
  await expect(dialog).toBeHidden();
}

test("a photo with GPS data comes back without it", async ({ page }) => {
  const { userId } = await signInNewMember(page, "gps");
  await page.goto("/me/edit");
  await uploadThroughCropper(page, await photoFile());
  await expect(page.getByRole("status").filter({ hasText: "Your new photo is ready." })).toBeVisible({
    timeout: 20_000,
  });

  const row = await avatarRow(userId);
  expect(row).toMatchObject({ avatar_status: "ready", avatar_pending_path: null });
  expect(row.avatar_path).toMatch(new RegExp(`^${userId}/[\\w-]{22}$`));
  // Stored under a random name, in three sizes. The original name is gone.
  const files = await storedFiles(userId);
  expect(files).toHaveLength(3);
  expect(files.join(" ")).not.toContain("IMG_2041");

  // Download what the app serves, at every size: WebP, no EXIF, no GPS.
  const img = page.locator(".profile-avatar img");
  await expect(img).toBeVisible();
  const src = (await img.getAttribute("src"))!;
  for (const px of ["96", "256", "512"]) {
    const res = await page.request.get(src.replace(/px=\d+/, `px=${px}`));
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/webp");
    expect(res.headers()["cache-control"]).toContain("private");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    const bytes = await res.body();
    expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect(hasGpsExif(bytes)).toBe(false);
    expect(bytes.includes(Buffer.from("Exif"))).toBe(false);
    expect(bytes.includes(Buffer.from(GPS_CAMERA_MAKE))).toBe(false);
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the original file is uploaded, and the server still strips GPS", async ({ page }) => {
    const { userId } = await signInNewMember(page, "nojs");
    await page.goto("/me/edit");
    await page.getByLabel("Choose a photo").setInputFiles(await photoFile());
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Checking your new photo" })).toBeVisible();

    // Screening runs after the response; look again shortly after.
    await expect.poll(async () => (await avatarRow(userId)).avatar_status, { timeout: 15_000 }).toBe("ready");
    const path = (await avatarRow(userId)).avatar_path!;
    const { data } = await admin().storage.from("avatars").download(`${path}-512.webp`);
    const bytes = Buffer.from(await data!.arrayBuffer());
    expect(hasGpsExif(bytes)).toBe(false);
    expect(bytes.includes(Buffer.from(GPS_CAMERA_MAKE))).toBe(false);
  });
});

test("a photo that fails screening is deleted, and the old photo stays", async ({ page }) => {
  const { userId } = await signInNewMember(page, "reject");
  await page.goto("/me/edit");
  await uploadThroughCropper(page, await photoFile());
  await expect(page.getByRole("status").filter({ hasText: "Your new photo is ready." })).toBeVisible({
    timeout: 20_000,
  });
  const live = (await avatarRow(userId)).avatar_path;

  await uploadThroughCropper(page, { name: "magenta.jpg", mimeType: "image/jpeg", buffer: await stubRejectedPhoto() });
  await expect(page.getByRole("status").filter({ hasText: "We couldn’t use that photo" })).toBeVisible({
    timeout: 20_000,
  });
  const row = await avatarRow(userId);
  expect(row).toEqual({ avatar_path: live, avatar_pending_path: null, avatar_status: "rejected" });
  expect(await storedFiles(userId)).toHaveLength(3);
});

test("files that aren't photos are refused", async ({ page }) => {
  await signInNewMember(page, "notimage");
  await page.goto("/me/edit");
  await page.getByLabel("Choose a photo").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "We couldn’t open that photo" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("removing the photo goes back to initials and deletes the files", async ({ page }) => {
  const { userId } = await signInNewMember(page, "remove");
  await page.goto("/me/edit");
  await uploadThroughCropper(page, await photoFile());
  await expect(page.getByRole("status").filter({ hasText: "Your new photo is ready." })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your photo is removed." })).toBeVisible();
  await expect(page.locator(".profile-avatar img")).toHaveCount(0);
  expect(await avatarRow(userId)).toEqual({ avatar_path: null, avatar_pending_path: null, avatar_status: "none" });
  expect(await storedFiles(userId)).toEqual([]);
});

test("avatars are served only to people allowed to see the profile", async ({ page, browser, baseURL }) => {
  const { userId } = await signInNewMember(page, "owner");
  await page.goto("/me/edit");
  await uploadThroughCropper(page, await photoFile());
  await expect(page.getByRole("status").filter({ hasText: "Your new photo is ready." })).toBeVisible({
    timeout: 20_000,
  });
  const src = (await page.locator(".profile-avatar img").getAttribute("src"))!;
  expect((await page.request.get(src)).status()).toBe(200);

  // A different member who shares no group with the owner (Phase 3 adds groups).
  const other = await browser.newContext({ baseURL, storageState: signedOut });
  const otherPage = await other.newPage();
  await signInNewMember(otherPage, "stranger");
  expect((await otherPage.request.get(src)).status()).toBe(404);
  await other.close();

  // Signed out.
  const anon = await browser.newContext({ baseURL, storageState: signedOut });
  expect((await anon.request.get(src)).status()).toBe(401);
  await anon.close();

  // Nonsense ids and sizes look the same as hidden ones.
  expect((await page.request.get(`/api/avatar/${userId}?px=7`)).status()).toBe(404);
  expect((await page.request.get("/api/avatar/not-a-uuid")).status()).toBe(404);
});

test("editing the profile and its privacy settings", async ({ page }) => {
  const { userId } = await signInNewMember(page, "edit");
  await page.goto("/me");
  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page).toHaveURL(/\/me\/edit$/);

  await page.getByLabel("Display name").fill("Grace W.");
  await page.getByLabel("Handle").fill(`@Grace_${userId.slice(-6)}`);
  await page.getByLabel("About me", { exact: true }).fill("Walking in freedom.\nOne day at a time.");
  await page.getByLabel("Favourite verse", { exact: true }).fill("John 8:36");
  await page.getByLabel("My testimony", { exact: true }).fill("He set me free.");
  await page.getByLabel("Who can see your testimony").selectOption("nobody");
  await page.getByLabel("Who can see my profile").selectOption("partners");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page).toHaveURL(/\/me\?saved=1$/);
  await expect(page.getByRole("status").filter({ hasText: "Your profile is saved." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grace W." })).toBeVisible();
  await expect(page.getByText(`@grace_${userId.slice(-6)}`)).toBeVisible();
  await expect(page.getByText("Walking in freedom.")).toBeVisible();
  await expect(page.getByText("Visible to: only me")).toBeVisible();

  const { data: profile } = await admin()
    .from("profiles")
    .select("display_name, handle, bio, favourite_verse, testimony")
    .eq("id", userId)
    .single();
  expect(profile).toEqual({
    display_name: "Grace W.",
    handle: `grace_${userId.slice(-6)}`,
    bio: "Walking in freedom.\nOne day at a time.",
    favourite_verse: "John 8:36",
    testimony: "He set me free.",
  });
  const { data: privacy } = await admin()
    .from("privacy_settings")
    .select("profile_visibility, testimony_visibility")
    .eq("user_id", userId)
    .single();
  expect(privacy).toEqual({
    profile_visibility: "partners",
    testimony_visibility: "nobody",
  });

  // Profile text is never written to the audit log; which settings changed is.
  const { data: events } = await admin()
    .from("audit_log")
    .select("action, metadata")
    .eq("actor_id", userId)
    .in("action", ["profile.updated", "profile.privacy_changed"]);
  expect(JSON.stringify(events)).not.toContain("freedom");
  expect(events?.find((e) => e.action === "profile.privacy_changed")?.metadata).toMatchObject({
    fields: expect.stringContaining("testimony_visibility"),
  });
});

test("a taken or reserved handle is refused with a clear message", async ({ page }) => {
  const first = await signInNewMember(page, "taken-a");
  const { data } = await admin().from("profiles").select("handle").eq("id", first.userId).single();
  await page.context().clearCookies();

  await signInNewMember(page, "taken-b");
  await page.goto("/me/edit");
  for (const [handle, message] of [
    [data!.handle, "That handle is taken. Please try another."],
    ["admin", "That handle isn’t available. Please try another."],
    ["x", "Use 3–20 lower-case letters, numbers or _ for your handle."],
  ] as const) {
    await page.getByLabel("Handle").fill(handle);
    await page.getByRole("button", { name: "Save profile" }).click();
    const summary = page.getByRole("alert", { name: "Please check the following" });
    await expect(summary).toBeFocused();
    await expect(summary.getByRole("link", { name: message })).toBeVisible();
    await expect(page.getByLabel("Handle")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/me\/edit$/);
  }
});

for (const theme of themes) {
  test(`the profile pages and the cropper have no WCAG 2.2 AA violations (${theme})`, async ({
    page,
    context,
    baseURL,
  }) => {
    await setTheme(context, baseURL!, theme);
    await signInNewMember(page, `axe-profile-${theme}`);
    await page.goto("/me");
    await expectNoAxeViolations(page, `/me (${theme})`);
    await page.goto("/me/edit");
    await expectNoAxeViolations(page, `/me/edit (${theme})`);
    await page.getByLabel("Choose a photo").setInputFiles(await photoFile());
    await expect(page.getByRole("dialog", { name: "Crop your photo" })).toBeVisible();
    await expectNoAxeViolations(page, `cropper (${theme})`);
  });
}

test("the photo cropper and the editor work with the keyboard alone", async ({ page }) => {
  const { userId } = await signInNewMember(page, "keys-profile");
  await page.goto("/me/edit");
  // A file chooser needs a pointer or Enter on the input; Playwright supplies the file.
  const chooser = page.waitForEvent("filechooser");
  await page.getByLabel("Choose a photo").focus();
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(await photoFile());

  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab"); // close button → first slider
  await expect(dialog.getByLabel("Zoom")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByLabel("Zoom")).toHaveValue("101");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByLabel("Left and right")).toHaveValue("-1");
  await dialog.getByRole("button", { name: "Use this photo" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Your new photo is ready." })).toBeVisible({
    timeout: 20_000,
  });

  // Escape cancels without uploading.
  const before = (await avatarRow(userId)).avatar_path;
  await page.getByLabel("Choose a photo").focus();
  await page.getByLabel("Choose a photo").setInputFiles(await photoFile());
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Choose a photo")).toBeFocused();
  expect((await avatarRow(userId)).avatar_path).toBe(before);

  // Then the form: type a bio and save with Enter on the button.
  await page.getByLabel("About me", { exact: true }).focus();
  await page.keyboard.type("Typed with keys");
  await page.getByRole("button", { name: "Save profile" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/me\?saved=1$/);
  await expect(page.getByText("Typed with keys")).toBeVisible();
});
