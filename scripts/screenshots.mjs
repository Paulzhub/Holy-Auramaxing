// The install sheet's screenshots (CLAUDE.md §13; D-127). Owner, 2026-10-27:
// Take a breath, the daily reading, and a group's "together" total. Each
// is taken from the running app with a demo account on the LOCAL database,
// with the rest of the page hidden, then checked for topic words before it
// is saved to public/screenshots/. Run after `npm run build` and with the
// app on http://localhost:3100 (or SCREENSHOT_URL):
//
//   npm run screenshots
//
// Never run it against a hosted database: it creates a demo account.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

nextEnv.loadEnvConfig(process.cwd());

const base = process.env.SCREENSHOT_URL ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("Refusing: NEXT_PUBLIC_SUPABASE_URL is not the local database.");
  process.exit(1);
}
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false } });
const userClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", {
  auth: { persistSession: false },
});

// The same list as src/lib/discretion.ts.
const SENSITIVE =
  /porn|fap|lust|masturbat|sexual|\bsex\b|relapse|addict|temptation|purity|\bslip|\bstreak|\burges?\b|clean day|sobriety|xxx/i;

const email = `screens-${randomBytes(4).toString("hex")}@example.test`;
const password = `Quiet morning ${randomBytes(6).toString("hex")} by the river`;
const zone = "Asia/Kolkata";
const day = (offset) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(Date.now() + offset * 86_400_000));

async function demoAccount() {
  const token = randomBytes(32).toString("base64url");
  await admin.rpc("create_signup_ticket", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_policy_version: "screens",
    p_timezone: zone,
    p_ttl_minutes: 5,
  });
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { signup_ticket: token },
  });
  if (error) throw error;
  const id = data.user.id;
  await admin
    .from("profiles")
    .update({
      onboarded_at: new Date().toISOString(),
      display_name: "Sam",
      created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    })
    .eq("id", id);
  const rows = [];
  for (let n = 41; n >= 1; n -= 1) rows.push({ user_id: id, local_date: day(-n), timezone: zone, outcome: "clean" });
  await admin.from("checkins").insert(rows);
  await userClient.auth.signInWithPassword({ email, password });
  const { data: groupId, error: groupError } = await userClient.rpc("create_group", {
    p_name: "Morning Light",
    p_description: "",
    p_challenge_type: "90",
    p_challenge_days: null,
    p_start_date: day(0),
    p_timezone: zone,
    p_max_members: 50,
    p_join_policy: "invite_only",
    p_covenant_text: "We walk together in grace and honesty.",
    p_min_share_level: "streak",
    p_leaderboard_hiding_allowed: false,
    p_my_share_level: "full",
  });
  if (groupError) throw groupError;
  await userClient.rpc("submit_checkin", { p_local_date: day(0), p_outcome: "clean" });
  // Group totals are refreshed by the job queue: give it a moment.
  await new Promise((r) => setTimeout(r, 15_000));
  return { groupId };
}

const shots = [
  { name: "breathe", path: () => "/breathe", keep: ".sos-section:has(.breath)" },
  { name: "reading", path: () => "/reading", keep: ".reading-verse" },
  { name: "together", path: (g) => `/groups/${g}`, keep: ".together-card" },
];
const sizes = [
  { form: "narrow", viewport: { width: 412, height: 915 }, scale: 2 },
  { form: "wide", viewport: { width: 1280, height: 800 }, scale: 1.5 },
];

const { groupId } = await demoAccount();
const browser = await chromium.launch();
mkdirSync(join("public", "screenshots"), { recursive: true });
for (const size of sizes) {
  const context = await browser.newContext({
    baseURL: base,
    viewport: size.viewport,
    deviceScaleFactor: size.scale,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/home$/);
  for (const shot of shots) {
    await page.goto(shot.path(groupId));
    // Hide everything in <main> except the one card (and what holds it).
    const visible = await page.evaluate((keep) => {
      const target = document.querySelector(keep);
      if (!target) throw new Error(`missing ${keep}`);
      const main = document.querySelector("main") ?? document.body;
      const path = new Set();
      for (let el = target; el && el !== main; el = el.parentElement) path.add(el);
      const hide = (parent) => {
        for (const child of Array.from(parent.children)) {
          if (child === target) continue;
          if (path.has(child)) hide(child);
          else child.setAttribute("hidden", "");
        }
      };
      hide(main);
      for (const t of document.querySelectorAll(".ui-toast-region, [data-testid=update-banner]"))
        t.setAttribute("hidden", "");
      window.scrollTo(0, 0);
      return document.body.innerText;
    }, shot.keep);
    if (SENSITIVE.test(visible)) {
      throw new Error(`${shot.name}: topic words on screen, not saved: ${visible.match(SENSITIVE)?.[0]}`);
    }
    await page.waitForTimeout(400);
    const file = join("public", "screenshots", `${size.form}-${shot.name}.png`);
    await page.screenshot({ path: file });
    console.log(`saved ${file}`);
  }
  await context.close();
}
await browser.close();
