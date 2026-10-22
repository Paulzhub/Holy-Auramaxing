import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import { globalErrorMessages } from "../app/global-error-messages";
import { exportFileName } from "../lib/data-export";
import { SENSITIVE_WORDS } from "../lib/discretion";
import { parseFrom } from "../lib/email/sender";
import { renderNotificationEmail } from "../emails/notification";
import { NOTIFICATION_TYPE_LIST } from "../features/notifications/constants";
import { buildDigestPush, buildPush, emailWords, outboundLine } from "../features/notifications/outbound";
import { BOARDS, boardHref } from "../features/gamification/leaderboards";

/**
 * Discretion (CLAUDE.md §2.3; privacy review 1, D-055). Everything someone
 * else might see without opening the app (a browser tab, the history, an
 * email in a shared inbox, a download, a share sheet) must say nothing about
 * what the app is for. New notification, push and share-card templates
 * (Phases 5–9) must be added to these checks.
 */

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Words that give the topic away, plus "xxx" (the old spelling of the name; D-059). */
const SENSITIVE = SENSITIVE_WORDS;

function strings(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

function expectDiscreet(entries: Array<[string, string]>) {
  const leaks = entries.filter(([, text]) => SENSITIVE.test(text)).map(([where, text]) => `${where}: ${text}`);
  expect(leaks).toEqual([]);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? [full, ...filesUnder(full)] : [full];
  });
}

describe("discretion: what people see outside the app", () => {
  it("the short name, tab titles and page description", () => {
    expectDiscreet([
      ["app.tabName", en.app.tabName],
      ["app.description", en.app.description],
      ...strings(en.meta, "meta"),
      ...strings(globalErrorMessages.en, "global-error"),
    ]);
  });

  it("the level share card's own words (each level's name is checked in levels.test.ts)", () => {
    expectDiscreet(strings(en.levels.shareCard, "levels.shareCard"));
  });

  it("every email the app sends: subject, preview and body", () => {
    expectDiscreet(strings(en.emails, "emails"));
  });

  it("Supabase Auth's emails: subjects and templates", () => {
    const subjects = [...read("supabase/config.toml").matchAll(/^subject = "(.*)"$/gm)].map((m): [string, string] => [
      "config.toml subject",
      m[1]!,
    ]);
    expect(subjects.length).toBeGreaterThanOrEqual(7);
    const templates = readdirSync(join(root, "supabase/templates")).map((name): [string, string] => [
      `templates/${name}`,
      read(`supabase/templates/${name}`).replace(/<[^>]+>/g, " "),
    ]);
    expectDiscreet([...subjects, ...templates]);
  });

  it("the sender name, whatever address is configured", () => {
    const sender = read("src/lib/email/sender.ts");
    const defaults = [...sender.matchAll(/const DEFAULT_\w+_FROM = "(.*)";/g)].map((m) => m[1]!);
    expect(defaults.length).toBeGreaterThan(0);
    for (const from of defaults) expect(parseFrom(from).name).toBe("Holy Auramaxing");
    expect(parseFrom("someone@example.com").name).toBe("Holy Auramaxing");
  });

  it("downloads and shares: the export file, its README and the invite share text", () => {
    expectDiscreet([
      ["export file name", exportFileName(new Date("2026-10-08T00:00:00Z"))],
      ["accountData.export.readme", en.accountData.export.readme],
      ["groups.invites.shareText", en.groups.invites.shareText],
    ]);
  });

  it('the app\'s own name has one spelling everywhere, without the old "xxx" (D-059)', () => {
    expect(en.app.name).toBe("Holy Auramaxing");
    expect(en.app.tabName).toBe(en.app.name);
    expect(en.emails.brand).toBe(en.app.name);
    expect(read("supabase/config.toml")).toMatch(/rp_display_name = "Holy Auramaxing"/);
  });

  it("the app's header uses the short name key, like the tab", () => {
    const chrome = [
      "src/components/shell/app-shell.tsx",
      "src/app/[locale]/_frames/auth-frame.tsx",
      "src/app/[locale]/(onboarding)/layout.tsx",
      "src/app/[locale]/error.tsx",
      "src/app/[locale]/not-found.tsx",
    ];
    for (const file of chrome) {
      const source = read(file);
      expect(source, file).not.toMatch(/app\.name/);
      expect(source, file).toMatch(/app\.tabName/);
    }
  });
});

describe("discretion: push notifications and notification emails (§7.8, D-092)", () => {
  // Every type, with every code it can carry, and a group whose name gives the
  // topic away: no push or email may ever show it.
  const GROUP_NAME = "NoFap Brothers: purity streak";
  const variants: Array<[string, Record<string, unknown>]> = NOTIFICATION_TYPE_LIST.flatMap((type) => {
    const shapes: Record<string, unknown>[] =
      type === "reaction"
        ? [{ target: "post", kind: "heart" }, { target: "comment" }, { target: "checkin" }]
        : type === "comment"
          ? [{ reply: false }, { reply: true }]
          : type === "challenge"
            ? [{ phase: "start" }, { phase: "end" }]
            : type === "partner_request"
              ? [{ what: "requested" }, { what: "accepted" }, { what: "ended" }]
              : type === "security"
                ? [{ what: "new_login" }, { what: "password_changed" }]
                : type === "milestone" || type === "badge_earned"
                  ? [{ badge: "free_90" }]
                  : type === "level_up"
                    ? [{ level: 64 }]
                    : type === "nudge"
                      ? [{ kind: "pray_for_me" }]
                      : [{}];
    return shapes.map((data): [string, Record<string, unknown>] => [type, { ...data, groupName: GROUP_NAME }]);
  });
  const lines = variants.flatMap(([type, data]) =>
    [true, false].flatMap((discreet) =>
      [null, "Sam"].map((actorName): [string, string] => [
        `${type} ${JSON.stringify(data)} discreet=${discreet} actor=${actorName}`,
        outboundLine({
          type: type as (typeof NOTIFICATION_TYPE_LIST)[number],
          data,
          discreet,
          actorName,
          groupId: "0199a000-0000-7000-8000-000000000001",
        }),
      ]),
    ),
  );

  it("every push line, in both modes, says nothing about the topic", () => {
    expect(lines.length).toBeGreaterThan(80);
    expectDiscreet(lines);
    expectDiscreet(strings(en.notifications.push, "notifications.push"));
    expectDiscreet(strings(en.notifications.email, "notifications.email"));
    expectDiscreet(strings(en.notifications.unsubscribe, "notifications.unsubscribe"));
    expectDiscreet(strings(en.notifications.device, "notifications.device"));
  });

  it("never a group's name, a level or a badge, nor any count of days", () => {
    for (const [where, text] of lines) {
      expect(text, where).not.toContain("NoFap");
      expect(text, where).not.toMatch(/\d/);
      expect(text, where).not.toMatch(/Set Free|Level/);
    }
  });

  it("with discreet mode on (the default), never a name either", () => {
    for (const [where, text] of lines.filter(([w]) => w.includes("discreet=true"))) {
      expect(text, where).not.toContain("Sam");
    }
  });

  it("the push itself: the neutral title and a path inside the app", () => {
    const push = buildPush({
      id: "0199a000-0000-7000-8000-000000000009",
      type: "partner_sos",
      data: {},
      discreet: true,
      actorName: "Sam",
      groupId: "0199a000-0000-7000-8000-000000000001",
      unread: 3,
    });
    expect(push.title).toBe(en.app.tabName);
    expect(push.url).toMatch(/^\/groups\/[0-9a-f-]{36}\/partner$/);
    expectDiscreet([
      ["push", JSON.stringify(push)],
      ["digest", JSON.stringify(buildDigestPush({ id: "x", count: 4 }))],
    ]);
  });

  it("every notification email: neutral subject, discreet body, one-click unsubscribe words", async () => {
    const subjects = new Set<string>();
    for (const [type, data] of variants) {
      for (const discreet of [true, false]) {
        const words = emailWords({
          type: type as (typeof NOTIFICATION_TYPE_LIST)[number],
          data,
          discreet,
          actorName: "Sam",
          groupId: null,
        });
        subjects.add(words.subject);
        const email = await renderNotificationEmail(words, {
          open: "https://example.test/alerts",
          unsubscribe: "https://example.test/unsubscribe?u=x",
          settings: "https://example.test/settings/notifications",
        });
        expectDiscreet([
          [`${type} subject`, email.subject],
          [`${type} html`, email.html.replace(/<[^>]+>/g, " ")],
          [`${type} text`, email.text],
        ]);
        expect(email.html).not.toContain("NoFap");
      }
    }
    // Subjects never say who or what: one neutral line, or the security one.
    expect([...subjects].sort()).toEqual(
      [en.notifications.email.subjectSecurity, en.notifications.email.subject].sort(),
    );
    const digest = await renderNotificationEmail(emailWords({ digest: 5 }), {
      open: "https://example.test/alerts",
      unsubscribe: "https://example.test/unsubscribe",
      settings: "https://example.test/settings/notifications",
    });
    expectDiscreet([["digest", digest.subject + digest.text]]);
  });

  it("the service worker and the install name", () => {
    const sw = read("public/sw.js");
    expectDiscreet([["sw.js", sw]]);
    expect(read("src/app/manifest.ts")).toMatch(/name: en\.app\.tabName/);
  });
});

describe("discretion: addresses in the browser history", () => {
  it("no page address names the topic or a check-in answer", () => {
    const appDir = join(root, "src/app");
    const segments = filesUnder(appDir)
      .filter((p) => statSync(p).isDirectory())
      .map((p) => relative(appDir, p))
      // Route groups, private folders and dynamic segments never appear in URLs.
      .map((p) =>
        p
          .split(/[\\/]/)
          .filter((s) => !/^\(.*\)$|^_|^\[/.test(s))
          .join("/"),
      )
      .filter(Boolean);
    const leaks = segments.filter((s) => /merc|grace|slip|clean|streak|\burge|relapse|porn|fap|lust|purity/i.test(s));
    expect(leaks).toEqual([]);
  });

  it("the slip page's own forms come back to the very same address, with nothing added (D-098)", () => {
    // ?saved=, ?prayer=, ?error= or a #fragment after /check-in/done would
    // exist only after a slip, so the history would say which answer it was.
    const sources = ["src/features", "src/app"].flatMap((dir) =>
      filesUnder(join(root, dir)).filter((p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)),
    );
    const addresses = sources.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/\/check-in\/done[^`"'\s)]*/g)].map((m): [string, string] => [
        relative(root, file),
        m[0],
      ]),
    );
    expect(addresses.length).toBeGreaterThan(3);
    for (const [file, address] of addresses) {
      expect(address, file).toMatch(/^\/check-in\/done(\?date=\$\{\w+(\.\w+)?\})?$/);
    }
    // Results travel in a one-minute cookie instead (src/lib/server/flash.ts).
    const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code("src/features/checkins/server/actions.ts")).not.toMatch(/saved=1|#reflection/);
    expect(code("src/features/social/server/accountability-actions.ts")).not.toMatch(/prayer=|#prayer-title/);
    expect(code("src/app/[locale]/(app)/check-in/done/page.tsx")).not.toMatch(/query\.(saved|error|prayer)/);
  });

  it("the journal and SOS never put a result in the address (Phase 8a, D-098)", () => {
    const code = read("src/features/recovery/server/actions.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const addresses = [...code.matchAll(/["`](\/[^"`]*)["`]/g)].map((m) => m[1]!);
    expect(addresses.length).toBeGreaterThan(5);
    for (const address of addresses) {
      // Journal forms come back to the same page (the result is in the one-minute cookie);
      // the partner number goes back to Settings, which says nothing about any answer.
      expect(address).toMatch(/^(\/journal(\/\$\{(id|rawId)\})?|\/settings\?(error=phone\w+|notice=\$\{[^}]+\})|\/\[locale\])$/);
    }
    // SOS actions answer the sheet itself and never redirect.
    const sos = code.slice(code.indexOf("export async function sosContextAction"), code.indexOf("const today ="));
    expect(sos.length).toBeGreaterThan(100);
    expect(sos).not.toMatch(/\bgo\(/);
  });

  it("leaderboard tabs go by number in the address, never by name (D-098)", () => {
    const group = "0199a000-0000-7000-8000-000000000001";
    expectDiscreet(BOARDS.flatMap((b) => [[`board ${b}`, boardHref(group, b, "week", 50)] as [string, string]]));
    for (const b of BOARDS) expect(boardHref(group, b)).not.toMatch(/level|free|encour|xp/);
  });

  it("a check-in lands on the same address whichever answer was given", () => {
    const actions = read("src/features/checkins/server/actions.ts");
    const targets = [...actions.matchAll(/go\(\s*`([^`]*)`/g)].map((m) => m[1]!);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      // `${page}` is the reflection's own /check-in/done address, checked below.
      expect(target).toMatch(/^(\/check-in(\/done)?\?|\$\{page\})/);
      expect(target).not.toMatch(/outcome|slip|clean/i);
    }
    expect(actions).toContain("const page = `/check-in/done?date=${date}`;");
    // No conditional redirect on the answer.
    expect(actions).not.toMatch(/outcome === "slipped"\s*\?\s*`\//);
  });
});
