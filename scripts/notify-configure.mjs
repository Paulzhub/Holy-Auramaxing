// Tells the LOCAL database where the app's notification sender is, so
// pg_net can call it when push or email is ready (D-092). The database runs
// in Docker, so it reaches the app on this computer as host.docker.internal.
// The local launcher runs this on every start (a database reset forgets it).
//
//   npm run notify:configure            (the app on port 3000)
//   npm run notify:configure -- 3100    (another port)
//
// Reads CRON_SECRET from .env.local and never prints it. For the hosted
// project, call public.notify_configure() once with the site's own URL (README).
import nextEnv from "@next/env";

import { localQuery } from "./local-sql.mjs";

nextEnv.loadEnvConfig(process.cwd());

const port = Number(process.argv[2] ?? 3000);
const secret = process.env.CRON_SECRET ?? "";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Usage: npm run notify:configure -- [port]");
  process.exit(1);
}
if (secret.length < 32 || !/^[A-Za-z0-9_-]+$/.test(secret)) {
  console.error("Set CRON_SECRET in .env.local first: at least 32 letters, digits, - or _ (see .env.example).");
  process.exit(1);
}
const url = `http://host.docker.internal:${port}/api/notify/deliver`;
try {
  localQuery(`select public.notify_configure('${url}', '${secret}')`);
} catch (error) {
  // The CLI's message, with the secret masked, so the cause is visible.
  const detail = String(error instanceof Error ? error.message : error).replaceAll(secret, "***");
  console.error("Couldn't configure the notification sender. Is Supabase running (npx supabase start)?");
  console.error(detail);
  process.exit(1);
}
console.log(`Notification sender: ${url}`);
