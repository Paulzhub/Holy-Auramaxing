import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import {
  NOTIFICATION_SECTIONS,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LIST,
  isLockedType,
  type NotificationType,
} from "./constants";
import { notificationHref } from "./links";
import { deliverySettingsSchema, parseCursor } from "./schemas";
import type { NotificationItem } from "./server/queries";
import { notificationText } from "./text";

const GROUP = "0199a000-0000-7000-8000-000000000001";
const POST = "0199a000-0000-7000-8000-000000000002";
const root = join(__dirname, "..", "..", "..");

describe("the catalogue (§7.8, D-089)", () => {
  // The database's own list, from the migration that seeds it.
  const sql = readFileSync(join(root, "supabase/migrations/20261021000100_notifications_core.sql"), "utf8");
  const seeded = [
    ...sql.matchAll(
      /\('([a-z_]+)',\s*'([a-z]+)',\s*\d+,\s*(true|false),\s*(true|false),\s*(true|false),\s*(true|false),\s*(true|false),\s*(true|false)\)/g,
    ),
  ].map(([, type, section, push, email, urgent, locked]) => ({ type, section, push, email, urgent, locked }));

  it("lists every type in §7.8, in the same order as the database", () => {
    expect(seeded.map((s) => s.type)).toEqual(NOTIFICATION_TYPE_LIST);
    expect(NOTIFICATION_TYPE_LIST).toHaveLength(21);
  });

  it("has the database's defaults, sections and locks", () => {
    for (const s of seeded) {
      const info: { section: string; push: boolean; email: boolean; urgent?: boolean; locked?: boolean } =
        NOTIFICATION_TYPES[s.type as NotificationType];
      expect([s.type, info.section, info.push, info.email, Boolean(info.urgent), Boolean(info.locked)]).toEqual([
        s.type,
        s.section,
        s.push === "true",
        s.email === "true",
        s.urgent === "true",
        s.locked === "true",
      ]);
    }
  });

  it("only security alerts can't be turned off; partner SOS and security are urgent", () => {
    expect(NOTIFICATION_TYPE_LIST.filter(isLockedType)).toEqual(["security"]);
    expect(seeded.filter((s) => s.urgent === "true").map((s) => s.type)).toEqual(["partner_sos", "security"]);
  });

  it("member joined reaches owners and admins only (owner, 2026-10-13)", () => {
    expect(NOTIFICATION_TYPES.member_joined.section).toBe("leading");
    expect(sql).toMatch(/'member_joined', v_group, v_user/);
    expect(sql).toMatch(/v_users := private.group_audience\(v_group, null, 200, true\);/);
  });

  it("every type and section has a name in the settings", () => {
    for (const type of NOTIFICATION_TYPE_LIST) expect(en.notifications.settings.types[type]).toBeTruthy();
    for (const section of NOTIFICATION_SECTIONS) expect(en.notifications.settings.sections[section]).toBeTruthy();
  });
});

describe("where a notification leads", () => {
  it("every type goes to a page inside the app", () => {
    for (const type of NOTIFICATION_TYPE_LIST) {
      const href = notificationHref({ type, groupId: GROUP, data: { post: POST } });
      expect(href).toMatch(/^\/[a-z]/);
      expect(href).not.toMatch(/^\/\//);
    }
  });

  it("posts and comments go to the post; partner things to the partner page", () => {
    expect(notificationHref({ type: "comment", groupId: GROUP, data: { post: POST } })).toBe(
      `/groups/${GROUP}/wall/${POST}`,
    );
    expect(notificationHref({ type: "partner_sos", groupId: GROUP, data: {} })).toBe(`/groups/${GROUP}/partner`);
    expect(notificationHref({ type: "report", groupId: GROUP, data: {} })).toBe(`/groups/${GROUP}/moderation`);
    expect(notificationHref({ type: "security", groupId: null, data: {} })).toBe("/settings/security");
  });

  it("an id that isn't a UUID can't send anyone elsewhere", () => {
    expect(notificationHref({ type: "comment", groupId: "../../evil", data: { post: "//evil.example" } })).toBe(
      "/alerts",
    );
    expect(notificationHref({ type: "comment", groupId: GROUP, data: { post: "javascript:alert(1)" } })).toBe(
      `/groups/${GROUP}/wall`,
    );
  });
});

describe("the words in the app", () => {
  const t = createTranslator({ locale: "en", messages: en, namespace: "notifications" });
  const tAll = createTranslator({ locale: "en", messages: en });
  const item = (type: NotificationType, data: Record<string, unknown> = {}, count = 1): NotificationItem => ({
    id: POST,
    type,
    groupId: GROUP,
    groupName: "Morning Light",
    actorName: "Sam",
    data,
    count,
    read: false,
    createdAt: new Date(0).toISOString(),
  });
  const samples: NotificationItem[] = [
    item("nudge", { kind: "praying" }),
    item("reaction", { target: "post" }, 3),
    item("reaction", { target: "checkin" }),
    item("comment", { reply: false }, 2),
    item("comment", { reply: true }),
    item("prayed_for_you"),
    item("prayer_request"),
    item("announcement"),
    item("milestone", { badge: "free_7" }),
    item("challenge", { phase: "start" }),
    item("challenge", { phase: "end" }),
    item("covenant"),
    item("partner_request", { what: "requested" }),
    item("partner_request", { what: "accepted" }),
    item("partner_request", { what: "ended" }),
    item("partner_missed"),
    item("partner_sos"),
    item("level_up", { level: 7 }),
    item("badge_earned", { badge: "free_1" }),
    item("join_request", {}, 2),
    item("member_joined"),
    item("report", {}, 4),
    item("security", { what: "new_login" }),
    item("security", { what: "password_changed" }),
    item("daily_reminder"),
    item("streak_at_risk"),
    item("weekly_recap"),
  ];
  const texts = samples.map((s) => notificationText(s, t as never, tAll as never));

  it("every type has words, with no placeholders left", () => {
    expect(new Set(samples.map((s) => s.type)).size).toBe(NOTIFICATION_TYPE_LIST.length);
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/[{}]|notifications\.|undefined/);
    }
  });

  it("folds read naturally", () => {
    expect(texts[1]).toBe("Sam and 2 others reacted to your post");
    expect(texts[2]).toBe("Sam reacted to your check-in");
    expect(texts[3]).toBe("Sam and 1 other commented on your post");
    expect(texts[21]).toBe("4 reports are waiting for a look");
  });

  it("someone unnamed (a hidden profile, a former member) is 'Someone'", () => {
    expect(notificationText({ ...item("announcement"), actorName: null }, t as never, tAll as never)).toBe(
      "Someone posted an announcement",
    );
  });

  it("grace, not shame (§2.1): no failure words in any notification copy", () => {
    const failure =
      /\b(fail\w*|relapse\w*|shame\w*|ashamed|ruin\w*|broke|broken|weak\w*|disappoint\w*|bad|wasted|lost|missed|lose|loser|slip\w*)\b/i;
    expect(texts.join("\n")).not.toMatch(failure);
    const values = (v: unknown): string[] =>
      typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(values) : [];
    expect(values(en.notifications).join("\n")).not.toMatch(failure);
  });
});

describe("settings input", () => {
  it("takes local times as HH:MM and a known digest", () => {
    const ok = {
      reminderTime: "",
      quietStart: "22:00",
      quietEnd: "07:00",
      digest: "daily",
      discreet: true,
      sound: true,
      vibrate: false,
    };
    expect(deliverySettingsSchema.safeParse(ok).success).toBe(true);
    expect(deliverySettingsSchema.safeParse({ ...ok, quietStart: "24:00" }).success).toBe(false);
    expect(deliverySettingsSchema.safeParse({ ...ok, digest: "hourly" }).success).toBe(false);
    expect(deliverySettingsSchema.safeParse({ ...ok, reminderTime: "8am" }).success).toBe(false);
  });

  it("reads the centre's cursor safely", () => {
    expect(parseCursor("2026-10-13T08:00:00.000Z", POST)).toEqual({ at: "2026-10-13T08:00:00.000Z", id: POST });
    expect(parseCursor("not a date", POST)).toBeNull();
    expect(parseCursor("2026-10-13T08:00:00Z", "1; drop table")).toBeNull();
    expect(parseCursor(undefined, undefined)).toBeNull();
  });
});
