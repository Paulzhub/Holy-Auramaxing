// Notification fan-out under load (CLAUDE.md §7.8, §14; D-092). Seeds a
// group of 5,000 members, times page requests (p50/p95) for the e2e shared
// member, posts an announcement to the group, times the same pages again
// while the notify worker fans it out, reports how long the fan-out took,
// then removes the bench data.
//
//   npm run build && npx next start -p 3100   (in another terminal)
//   npx playwright test --project=setup       (once, for tests/e2e/.auth/member.json)
//   npm run bench:notify
//
// Local only: it writes through `supabase db query --local`, and seeds with
// psql inside the local database's Docker container.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { localQuery } from "./local-sql.mjs";

const BASE = process.env.BENCH_URL ?? "http://localhost:3100";
const GROUP = "00000000-0000-7000-8000-0000000b7000";
const REQUESTS = Number(process.env.BENCH_REQUESTS ?? 240);
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 8);

// One statement each (the CLI's rule), through a file (scripts/local-sql.mjs).
const sql = localQuery;

const state = JSON.parse(readFileSync("tests/e2e/.auth/member.json", "utf8"));
const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const authCookie = state.cookies.find((c) => c.name.endsWith("-auth-token"));
const session = JSON.parse(
  Buffer.from(decodeURIComponent(authCookie.value).replace(/^base64-/, ""), "base64").toString("utf8"),
);
const owner = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8")).sub;

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function timePages(label) {
  // Everyday pages for a member, plus the bell's count. (The 5,000-member
  // group's own home renders every member's Today row; the app caps groups
  // at 500, so it isn't a fair page to time here.)
  const paths = ["/home", "/alerts", "/groups", "/settings/notifications", "/api/notifications/unread"];
  const times = [];
  let next = 0;
  let failed = 0;
  async function worker() {
    while (next < REQUESTS) {
      const path = paths[next++ % paths.length];
      const started = performance.now();
      const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
      await res.arrayBuffer();
      if (res.status >= 400) failed += 1;
      times.push(performance.now() - started);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  times.sort((a, b) => a - b);
  return {
    label,
    requests: times.length,
    failed,
    p50_ms: Math.round(percentile(times, 50)),
    p95_ms: Math.round(percentile(times, 95)),
  };
}

// Seeding and cleaning up need the superuser (triggers off), so they run
// through psql inside the local database's container (Docker).
const PROJECT = /^project_id = "(.+)"$/m.exec(readFileSync("supabase/config.toml", "utf8"))[1];
function psql(text, vars = {}) {
  const run = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${PROJECT}`,
      "psql",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      ...Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`]),
    ],
    { input: text, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (run.status !== 0) throw new Error(run.stderr || run.stdout);
}

function cleanup() {
  psql(`delete from public.notifications where group_id = '${GROUP}';
        delete from public.groups where id = '${GROUP}';
        delete from auth.users where email like 'bench-notify-%@example.test';`);
}

const rows = [];
try {
  console.log(`Seeding 5,000 members (owner ${owner.slice(0, 8)}…)`);
  psql(readFileSync("supabase/bench/notify_5000_seed.sql", "utf8"), { owner });
  await timePages("warm-up");
  rows.push(await timePages("before (no fan-out)"));

  const [post] = sql(`insert into public.posts (group_id, author_id, kind, body)
                      values ('${GROUP}', '${owner}', 'announcement', 'Bench announcement.') returning id::text as id`);
  // Time pages while the worker fans out; nothing else runs from here meanwhile
  // (polling with a new process each second would itself slow the machine).
  rows.push(await timePages("during the fan-out"));
  let done = 0;
  for (let i = 0; i < 90 && done < 5000; i += 1) {
    const [r] = sql(`select count(*)::int as n from public.notifications where dedupe_key = 'post:${post.id}'`);
    done = r.n;
    if (done < 5000) await new Promise((r) => setTimeout(r, 2000));
  }
  // From the database's own clock: the post, to the last notification written.
  const [span] = sql(`select round(extract(epoch from max(n.created_at) - p.created_at)::numeric, 1)::text as s
                        from public.notifications n join public.posts p on p.id = '${post.id}'
                       where n.dedupe_key = 'post:${post.id}' group by p.created_at`);
  rows.push(await timePages("after"));
  console.table(rows);
  console.log(`Fan-out: ${done} notifications in ${span?.s ?? "?"} s (worker every 5 s, 250 a job, 750 ms a run).`);
} finally {
  cleanup();
}
