import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { isDiscreet } from "../../lib/discretion";
import { BADGE_SLUGS } from "./badges";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20261015000100_gamification_xp_badges.sql");
const verses = (JSON.parse(read("data/badge_verses.json")) as { verses: Record<string, string> }).verses;

// The badges the migration seeds: (slug, kind, threshold, icon, reference, verse text, sort).
const seeded = [
  ...migration.matchAll(
    /\('([a-z0-9_]+)', '([a-z_]+)', (null|\d+), '([a-z-]+)', '([^']+)',\s*'((?:[^']|'')*)', \d+\)/g,
  ),
].map((m) => ({ slug: m[1], kind: m[2], threshold: m[3], icon: m[4], reference: m[5] ?? "", verse: m[6] ?? "" }));

describe("badges (§7.6, D-072)", () => {
  it("the app, the messages and the database name the same eighteen badges", () => {
    expect(seeded.map((b) => b.slug)).toEqual([...BADGE_SLUGS]);
    expect(Object.keys(en.badges.items).sort()).toEqual([...BADGE_SLUGS].sort());
  });

  it("free-day and check-in milestones match the spec", () => {
    const of = (kind: string) => seeded.filter((b) => b.kind === kind).map((b) => Number(b.threshold));
    expect(of("free_days")).toEqual([1, 3, 7, 14, 21, 30, 40, 60, 90, 180, 365]);
    expect(of("checkin_days")).toEqual([7, 30, 100]);
  });

  it("each verse is the World English Bible text in data/badge_verses.json", () => {
    // The Phase 5 seed holds the old edition; the D-105 migration sets today's text.
    const current = read("supabase/migrations/20261025000100_gamification_verses_web_current.sql");
    for (const b of seeded) {
      expect(current, b.reference).toContain(
        `update public.badges set verse_text = '${(verses[b.reference] ?? "").replace(/'/g, "''")}' where slug = '${b.slug}';`,
      );
    }
  });

  it("badge names never give the topic away (groups see them, §2.3)", () => {
    for (const slug of BADGE_SLUGS) {
      const item = en.badges.items[slug];
      expect(isDiscreet(item.name), item.name).toBe(true);
      expect(isDiscreet(item.description), item.description).toBe(true);
    }
  });
});

describe("XP and badge copy: grace, not shame (§2.1, §2.2)", () => {
  const words =
    /\b(fail\w*|relapse\w*|shame\w*|ashamed|ruin\w*|broke|broken|weak\w*|disappoint\w*|bad|wasted|lost|missed|lose)\b/i;
  it("no failure words", () => {
    expect(JSON.stringify(en.badges)).not.toMatch(words);
  });
  it("says plainly that an honest slip earns the same XP", () => {
    expect(en.badges.xpHow).toMatch(/whether you stayed free or slipped/);
  });
});
