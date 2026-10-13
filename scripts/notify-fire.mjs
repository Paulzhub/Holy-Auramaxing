// Fires every notification type (CLAUDE.md §7.8) at one account on the LOCAL
// database, through the real pipeline (private.deliver: who gets it, then each
// channel planned by that person's choices, snooze, quiet hours, digest, group
// mute and the hourly limit), and prints what happened on each channel.
//
//   npm run notify:fire -- you@example.com            every type
//   npm run notify:fire -- you@example.com nudge      one type
//
// With the app running and the sender configured (Phase 7c), "ready" push and
// email go out within a few seconds. Local only: it uses `supabase db query --local`.
import { localQuery } from "./local-sql.mjs";

const TYPES = [
  "daily_reminder",
  "streak_at_risk",
  "weekly_recap",
  "nudge",
  "reaction",
  "comment",
  "prayed_for_you",
  "prayer_request",
  "announcement",
  "milestone",
  "challenge",
  "covenant",
  "partner_request",
  "partner_missed",
  "partner_sos",
  "level_up",
  "badge_earned",
  "join_request",
  "member_joined",
  "report",
  "security",
];
const IN_A_GROUP = new Set([
  "nudge",
  "reaction",
  "comment",
  "prayed_for_you",
  "prayer_request",
  "announcement",
  "milestone",
  "challenge",
  "covenant",
  "partner_request",
  "partner_missed",
  "partner_sos",
  "join_request",
  "member_joined",
  "report",
]);
const DATA = {
  nudge: { kind: "praying" },
  reaction: { target: "post", kind: "heart" },
  comment: { reply: false },
  milestone: { badge: "free_7" },
  badge_earned: { badge: "free_1" },
  level_up: { level: 3 },
  challenge: { phase: "start" },
  partner_request: { what: "requested" },
  security: { what: "new_login" },
};

const [email, only] = process.argv.slice(2);
if (!email || !/^[^@\s'"]+@[^@\s'"]+$/.test(email) || (only && !TYPES.includes(only))) {
  console.error("Usage: npm run notify:fire -- you@example.com [type]");
  console.error(`Types: ${TYPES.join(", ")}`);
  process.exit(1);
}

function query(sql) {
  try {
    return localQuery(sql);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const [me] = query(`
  select u.id::text as id,
         (select m.group_id::text from public.group_members m
           where m.user_id = u.id and m.status = 'active' order by m.joined_at limit 1) as group_id
    from auth.users u where lower(u.email) = lower('${email}')`);
if (!me) {
  console.error(`No account with the email ${email} in the local database.`);
  process.exit(1);
}
const [other] = me.group_id
  ? query(`select m.user_id::text as id from public.group_members m
            where m.group_id = '${me.group_id}' and m.user_id <> '${me.id}' and m.status = 'active' limit 1`)
  : [];

const run = Date.now().toString(36);
const types = only ? [only] : TYPES;
const results = [];
for (const type of types) {
  if (IN_A_GROUP.has(type) && !me.group_id) {
    results.push({ type, in_app: "skipped: join a group first" });
    continue;
  }
  const group = IN_A_GROUP.has(type) ? `'${me.group_id}'::uuid` : "null";
  const actor = other && type !== "report" && !type.startsWith("security") ? `'${other.id}'::uuid` : "null";
  const data = JSON.stringify(DATA[type] ?? {}).replace(/'/g, "''");
  const [row] = query(`
    with sent as (
      select private.deliver(array['${me.id}']::uuid[], '${type}', ${group}, ${actor}, '${data}'::jsonb,
                             'fire:${run}:${type}', null) as n
    )
    select (select n from sent) as notified,
           (select string_agg(d.channel || '=' || d.status || coalesce(' (' || d.reason || ')', ''), ', ' order by d.channel)
              from private.notification_deliveries d
              join public.notifications x on x.id = d.notification_id
             where x.user_id = '${me.id}' and x.dedupe_key = 'fire:${run}:${type}') as channels`);
  results.push({
    type,
    in_app: Number(row?.notified) > 0 ? "yes" : "no (left out: see D-089)",
    "push / email": row?.channels ?? "off, or no device",
  });
}
console.table(results);
