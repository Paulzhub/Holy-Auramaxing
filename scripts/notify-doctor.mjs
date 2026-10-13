// Shows where push and email notifications stop on THIS computer (local
// Supabase only), from the event to Mailpit (D-092):
//   1. who chose email, and for which types;
//   2. the last few hours' notifications and what each channel did;
//   3. the database's calls to the app's sender (pg_net) and their answers;
//   4. whether the app and Mailpit answer, and one direct run of the sender.
//
//   npm run notify:doctor            (the app on port 3000)
//   npm run notify:doctor -- 3100    (another port)
//
// It prints no email addresses or secrets (people are shown by the first 8
// characters of their id), and saves the same report to notify-doctor.txt.
import { writeFileSync } from "node:fs";

import nextEnv from "@next/env";

import { localQuery } from "./local-sql.mjs";

nextEnv.loadEnvConfig(process.cwd());

const port = Number(process.argv[2] ?? 3000);
const secret = process.env.CRON_SECRET ?? "";
const mailpit = (process.env.MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");
const lines = [];
const say = (text = "") => {
  lines.push(text);
  console.log(text);
};
const table = (rows) => {
  if (!rows.length) return say("  (none)");
  for (const row of rows)
    say(
      "  " +
        // The CLI sorts keys by name, so columns are named c1, c2, ... in order.
        Object.keys(row)
          .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
          .map((k) => (row[k] === null ? "-" : String(row[k])))
          .join(" | "),
    );
};
function section(title, sql) {
  say(`\n== ${title}`);
  try {
    table(localQuery(sql));
  } catch (error) {
    say(
      `  couldn't read: ${String(error instanceof Error ? error.message : error).replaceAll(secret || "\u0000", "***")}`,
    );
  }
}

say(`Notification check, ${new Date().toISOString()}`);

section(
  "1. Sender address in the database, and whether its secret matches CRON_SECRET in .env.local (address | matches)",
  `select (select decrypted_secret from vault.decrypted_secrets where name = 'notify_deliver_url') as c1,
          coalesce((select decrypted_secret = '${secret.replace(/'/g, "")}' from vault.decrypted_secrets
                     where name = 'notify_deliver_secret'), false) as c2`,
);

section(
  "2. Email choices (person | type | on) - email is off for every type until someone turns it on",
  `select left(user_id::text, 8) as c1, type as c2, enabled as c3 from public.notification_preferences
    where channel = 'email' order by user_id, type`,
);

section(
  "3. Quiet hours, digest and snooze (person | quiet from | to | digest | snoozed until | local time now)",
  `select left(s.user_id::text, 8) as c1, s.quiet_hours_start as c2, s.quiet_hours_end as c3, s.digest as c4,
          s.snooze_until as c5, to_char(now() at time zone p.timezone, 'HH24:MI') as c6
     from public.notification_settings s join public.profiles p on p.id = s.user_id
    where s.user_id in (select user_id from public.notification_preferences where channel = 'email')`,
);

section(
  "4. Notifications in the last 6 hours (when UTC | type | person | push and email: status (reason))",
  `select to_char(n.created_at, 'HH24:MI:SS') as c1, n.type as c2, left(n.user_id::text, 8) as c3,
          coalesce((select string_agg(d.channel || ': ' || d.status || coalesce(' (' || d.reason || ')', '')
                                       || case when d.release_at is not null
                                               then ' until ' || to_char(d.release_at, 'HH24:MI') || ' UTC' else '' end,
                                       ', ' order by d.channel)
                      from private.notification_deliveries d where d.notification_id = n.id),
                   'in-app only (push and email off, or no device)') as c4
     from public.notifications n
    where n.created_at > now() - interval '6 hours'
    order by n.created_at desc limit 20`,
);

section(
  "5. The database's last calls to the sender (when UTC | HTTP status | error)",
  `select to_char(created, 'HH24:MI:SS') as c1, status_code as c2, coalesce(left(error_msg, 160), '-') as c3
     from net._http_response order by created desc limit 6`,
);

section(
  "6. The sender's schedule (job | runs | on)",
  `select jobname as c1, schedule as c2, active as c3 from cron.job where jobname like 'notify%' order by jobname`,
);

say("\n== 7. The app, Mailpit and one direct run of the sender");
for (const [name, url, init] of [
  ["app health", `http://localhost:${port}/api/health`, {}],
  ["Mailpit", `${mailpit}/api/v1/info`, {}],
  [
    "sender (sends anything ready now)",
    `http://localhost:${port}/api/notify/deliver`,
    { method: "POST", headers: { Authorization: `Bearer ${secret}` } },
  ],
]) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const body = (await response.text()).slice(0, 200).replace(/\s+/g, " ");
    say(`  ${name}: ${response.status} ${name === "Mailpit" ? "" : body}`);
  } catch (error) {
    say(`  ${name}: no answer (${error instanceof Error ? error.message : error})`);
  }
}

say(`
What the answers mean:
- 2 empty: nobody has email on. In Settings, Notifications, tick Email for a type and press Save.
- 4 shows "email: held (quiet_hours)" or "(snoozed)": it waits until the time shown, by design.
- 4 shows "email: skipped (rate_limited)": at most 3 emails an hour per person.
- 4 shows "in-app only" for someone who has email on: that type's email isn't on for them.
- 4 shows "email: ready" and 5 shows errors or nothing: the database can't reach the app
  (see 5's error). On Windows, allow Node.js through the firewall on private networks,
  then restart the launcher.
- 7 "sender" answers 401: the secret doesn't match; restart the launcher (it runs notify:configure).`);

writeFileSync("notify-doctor.txt", lines.join("\n") + "\n");
console.log("\nSaved to notify-doctor.txt");
