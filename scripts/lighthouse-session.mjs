// Signs in a throwaway local test member and writes .lighthouseci/lighthouserc.app.json:
// lighthouserc.app.json plus that member's session cookie, so Lighthouse can
// audit signed-in pages. (App pages are noindex by design, D-008.)
// Local Supabase only (needs SUPABASE_SECRET_KEY); never point this at production.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import nextEnv from "@next/env";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishable || !secret) throw new Error("Supabase env vars are missing (see README).");
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("Refusing to run against a non-local Supabase.");

const email = "lighthouse@example.test";
const password = `Lighthouse ${randomBytes(8).toString("hex")} morning`;
const admin = createClient(url, secret, { auth: { persistSession: false } });

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const existing = list.users.find((u) => u.email === email);
if (existing) {
  await admin.auth.admin.updateUserById(existing.id, { password });
} else {
  const token = randomBytes(32).toString("base64url");
  await admin.rpc("create_signup_ticket", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_policy_version: "lighthouse",
    p_timezone: "Asia/Kolkata",
    p_ttl_minutes: 5,
  });
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { signup_ticket: token },
  });
  if (error) throw error;
}
const { data: again } = await admin.auth.admin.listUsers({ perPage: 1000 });
const member = again.users.find((u) => u.email === email);
await admin.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", member.id);

const jar = new Map();
const client = createServerClient(url, publishable, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await client.auth.signInWithPassword({ email, password });
if (error) throw error;

// Group pages need a group: the Lighthouse member owns one (Phase 3).
const { data: owned } = await client
  .from("group_members")
  .select("group_id")
  .eq("user_id", member.id)
  .eq("role", "owner")
  .limit(1);
let groupId = owned?.[0]?.group_id;
if (!groupId) {
  const { data, error: groupError } = await client.rpc("create_group", {
    p_name: "Lighthouse group",
    p_description: "",
    p_challenge_type: "40",
    p_challenge_days: null,
    p_start_date: new Date().toISOString().slice(0, 10),
    p_timezone: "Asia/Kolkata",
    p_max_members: 50,
    p_join_policy: "invite_only",
    p_covenant_text: "We walk together in grace and honesty.",
    p_min_share_level: "checkin_only",
    p_leaderboard_hiding_allowed: true,
    p_my_share_level: "full",
  });
  if (groupError) throw groupError;
  groupId = data;
}

// Check-in pages need history (Phase 4): five weeks of check-ins in Asia/Kolkata,
// a clean day three days ago and a slip four days ago (outside the window, so
// nothing here can be changed through the app).
const day = (offset) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - offset * 86_400_000));
await admin.from("checkins").delete().eq("user_id", member.id);
const { error: seedError } = await admin.from("checkins").insert(
  Array.from({ length: 35 }, (_, i) => i + 2)
    .filter((n) => n % 8 !== 0)
    .map((n) => ({
      user_id: member.id,
      local_date: day(n),
      timezone: "Asia/Kolkata",
      outcome: n === 4 || n === 19 ? "slipped" : "clean",
      mood: (n % 5) + 1,
      urge_level: (n * 3) % 6,
      triggers: n % 3 === 0 ? ["tired", "late_night"] : ["stressed"],
    })),
);
if (seedError) throw seedError;

const config = JSON.parse(readFileSync("lighthouserc.app.json", "utf8"));
const base = "http://localhost:3200";
config.ci.collect.url.push(
  `${base}/groups/${groupId}`,
  `${base}/groups/${groupId}/members`,
  `${base}/groups/${groupId}/invites`,
  `${base}/groups/${groupId}/settings`,
  `${base}/check-in/done?date=${day(3)}`,
  // The same address after a slip (D-055): this day is a slip, so it shows the grace page.
  `${base}/check-in/done?date=${day(4)}`,
);
config.ci.collect.settings.extraHeaders = JSON.stringify({
  Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
});
mkdirSync(".lighthouseci", { recursive: true });
writeFileSync(".lighthouseci/lighthouserc.app.json", JSON.stringify(config, null, 2));
console.log(`Signed in ${email} for Lighthouse.`);
