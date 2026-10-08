import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import { globalErrorMessages } from "../app/global-error-messages";
import { exportFileName } from "../lib/data-export";
import { parseFrom } from "../lib/email/sender";

/**
 * Discretion (CLAUDE.md §2.3; privacy review 1, D-055). Everything someone
 * else might see without opening the app (a browser tab, the history, an
 * email in a shared inbox, a download, a share sheet) must say nothing about
 * what the app is for. New notification, push and share-card templates
 * (Phases 5–9) must be added to these checks.
 */

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Words that give the topic away, plus the full name (whose "xxx" reads badly at a glance). */
const SENSITIVE =
  /porn|fap|lust|masturbat|sexual|\bsex\b|relapse|addict|temptation|purity|\bslip|\bstreak|\burges?\b|clean day|sobriety|auramax|xxx/i;

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
    for (const from of defaults) expect(parseFrom(from).name).toBe("Aura");
    expect(parseFrom("someone@example.com").name).toBe("Aura");
  });

  it("downloads and shares: the export file, its README and the invite share text", () => {
    expectDiscreet([
      ["export file name", exportFileName(new Date("2026-10-08T00:00:00Z"))],
      ["accountData.export.readme", en.accountData.export.readme],
      ["groups.invites.shareText", en.groups.invites.shareText],
    ]);
  });

  it("the name in the app's header is the short one; the full name stays on public pages", () => {
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
