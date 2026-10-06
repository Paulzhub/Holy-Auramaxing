// Runs the account purge now (D-033): erases accounts whose 14 days are
// over, then removes their files from Storage. The database does the
// erasing by itself every day; this also empties the photo queue, which
// needs the app.
//
//   npm run accounts:purge
//
// The app must be running (npm run dev or npm start), with CRON_SECRET in
// .env.local. Never prints the secret.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { CRON_SECRET, NEXT_PUBLIC_SITE_URL } = process.env;
if (!CRON_SECRET || CRON_SECRET.length < 32) {
  console.error("Set CRON_SECRET (at least 32 characters) in .env.local first (see .env.example).");
  process.exit(1);
}

const url = new URL("/api/cron/account-purge", NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
try {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      `The purge failed (${response.status}).${response.status === 404 ? " Restart the app after setting CRON_SECRET." : ""}`,
    );
    process.exit(1);
  }
  console.log(
    `Accounts erased: ${body.erased}. Photo folders emptied: ${body.foldersEmptied}. Still waiting: ${body.failed}.`,
  );
} catch {
  console.error(`Couldn't reach the app at ${url.origin}. Is it running?`);
  process.exit(1);
}
