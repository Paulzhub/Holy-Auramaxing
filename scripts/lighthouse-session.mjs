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

const jar = new Map();
const client = createServerClient(url, publishable, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await client.auth.signInWithPassword({ email, password });
if (error) throw error;

const config = JSON.parse(readFileSync("lighthouserc.app.json", "utf8"));
config.ci.collect.settings.extraHeaders = JSON.stringify({
  Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
});
mkdirSync(".lighthouseci", { recursive: true });
writeFileSync(".lighthouseci/lighthouserc.app.json", JSON.stringify(config, null, 2));
console.log(`Signed in ${email} for Lighthouse.`);
