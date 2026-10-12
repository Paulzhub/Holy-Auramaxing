import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { isDiscreet } from "../../lib/discretion";
import { levelChangeAfterSave } from "./level-change";
import { daysForLevel, daysToNext, levelLabel, replay, type ReplayDay } from "./levels";
import type { LevelOverview } from "./server/queries";
import { canShareLevel, shareCardText } from "./share-card";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

interface Tier {
  tier: number;
  era: string;
  name: string;
  reference: string;
}
const levelsJson = JSON.parse(read("data/levels.json")) as { tiers: Tier[] };
const verses = (JSON.parse(read("data/level_verses.json")) as { verses: Record<string, string> }).verses;
const names = levelsJson.tiers.map((t) => t.name);

/** data/levels.csv rows (no field contains a comma). */
const csv = read("data/levels.csv")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [level, label, , , , , , days] = line.split(",");
    return { level: Number(level), label: label ?? "", days: Number(days) };
  });

describe("levels match data/levels.csv (§7.6)", () => {
  it("has every level 0–1002", () => {
    expect(csv).toHaveLength(1003);
    expect(csv.at(-1)?.level).toBe(1002);
  });

  it("every label and day count matches", () => {
    const wrong = csv.filter((r) => levelLabel(r.level, names) !== r.label || daysForLevel(r.level) !== r.days);
    expect(wrong).toEqual([]);
  });

  it("the spec's examples", () => {
    expect(levelLabel(0, names)).toBe("Clay");
    expect(levelLabel(1, names)).toBe("Breath of Life");
    expect(levelLabel(2, names)).toBe("Breath of Life Lite");
    expect(levelLabel(6, names)).toBe("Breath of Life Ultra Pro Max");
    expect(daysForLevel(6)).toBe(30);
    expect(levelLabel(7, names)).toBe("Ark Builder");
    expect(daysForLevel(20)).toBe(100);
    expect(daysForLevel(21)).toBe(110);
    expect(levelLabel(1000, names)).toBe("Well Done Max");
    expect(daysForLevel(1000)).toBe(9900);
  });

  it('continues past Level 1002 as "Well Done 2", "Well Done 2 Lite"…', () => {
    expect(levelLabel(1002, names)).toBe("Well Done Ultra Pro Max");
    expect(levelLabel(1003, names)).toBe("Well Done 2");
    expect(levelLabel(1004, names)).toBe("Well Done 2 Lite");
    expect(levelLabel(1009, names)).toBe("Well Done 3");
  });

  it("the pgTAP test embeds the same table", () => {
    const sql = read("supabase/tests/database/050_gamification_levels.test.sql");
    const missing = csv.filter((r) => !sql.includes(`(${r.level}, '${r.label.replace(/'/g, "''")}', ${r.days})`));
    expect(missing).toEqual([]);
  });

  it("every tier has its World English Bible verse, seeded by the migration", () => {
    const migration = read("supabase/migrations/20261014000100_gamification_levels.sql");
    expect(levelsJson.tiers).toHaveLength(168);
    for (const t of levelsJson.tiers) {
      const verse = verses[t.reference];
      expect(verse, t.reference).toBeTruthy();
      expect(migration).toContain(
        `(${t.tier}, '${t.era.replace(/'/g, "''")}', '${t.name.replace(/'/g, "''")}', '${t.reference}', '${(verse ?? "").replace(/'/g, "''")}')`,
      );
    }
  });
});

describe("the reference replay (D-063)", () => {
  const clean = (n: number): ReplayDay[] => Array<ReplayDay>(n).fill("clean");

  it("5 days a level to 20, then 10", () => {
    expect(daysToNext(19)).toBe(5);
    expect(daysToNext(20)).toBe(10);
    expect(replay(clean(100)).level).toBe(20);
    expect(replay(clean(110)).level).toBe(21);
  });

  it("a slip drops 10 levels, never below 0, and empties the bar", () => {
    expect(replay([...clean(150), "slipped"])).toEqual({ level: 15, progress: 0, highest: 25 });
    expect(replay([...clean(35), "slipped"]).level).toBe(0);
    expect(replay(["slipped"])).toEqual({ level: 0, progress: 0, highest: 0 });
  });

  it("a missed day costs exactly what a slip costs", () => {
    expect(replay([...clean(150), null])).toEqual(replay([...clean(150), "slipped"]));
    expect(replay([...clean(300), null, null, null]).level).toBe(10);
  });

  it("a paused day (account closing) costs nothing", () => {
    expect(replay([...clean(153), "paused", "paused", "clean"])).toEqual({ level: 25, progress: 4, highest: 25 });
  });

  it("matches data/build_levels.py's self-test cases", () => {
    const py = read("data/build_levels.py");
    expect(py).toContain('elif outcome in ("slipped", None):');
    expect(replay([...clean(3), null, ...clean(2)])).toEqual({ level: 0, progress: 2, highest: 0 });
  });
});

describe("level changes after a check-in", () => {
  const base: LevelOverview = {
    level: 7,
    label: "Ark Builder",
    era: "Genesis",
    tier: 2,
    reference: "Genesis 6:14",
    verseText: "",
    progressDays: 0,
    daysToNext: 5,
    nextLabel: "Ark Builder Lite",
    nextEra: "Genesis",
    highestLevel: 7,
    missedSinceLast: 0,
    storedLevel: 7,
    levelBeforeSave: 6,
    beforeLabel: "Breath of Life Ultra Pro Max",
    beforeEra: "Genesis",
  };

  it("up, up into a new era, down, or nothing", () => {
    expect(levelChangeAfterSave(base)).toEqual({ kind: "up", label: "Ark Builder", era: "Genesis", newEra: false });
    expect(levelChangeAfterSave({ ...base, beforeEra: "Beginning" })).toMatchObject({ kind: "up", newEra: true });
    expect(levelChangeAfterSave({ ...base, level: 0, label: "Clay", levelBeforeSave: 7 })).toEqual({
      kind: "down",
      label: "Clay",
    });
    expect(levelChangeAfterSave({ ...base, levelBeforeSave: 7 })).toEqual({ kind: "same" });
    expect(levelChangeAfterSave({ ...base, levelBeforeSave: null })).toEqual({ kind: "same" });
  });
});

describe("share card (§2.3)", () => {
  const t = (key: "levelAndEra" | "footer", values?: Record<string, string | number>) =>
    key === "footer"
      ? en.levels.shareCard.footer
      : en.levels.shareCard.levelAndEra.replace("{level}", String(values?.level)).replace("{era}", String(values?.era));

  it("every level that can be shared is discreet, and the rest have no card", () => {
    const shareable = csv.filter((r) => {
      const tier = levelsJson.tiers[Math.min(r.level === 0 ? 0 : Math.floor((r.level - 1) / 6) + 1, 167)];
      return canShareLevel({ level: r.level, label: r.label, era: tier?.era ?? "", reference: tier?.reference ?? "" });
    });
    for (const r of shareable) {
      const tier = levelsJson.tiers[Math.floor((r.level - 1) / 6) + 1];
      const card = shareCardText(
        { level: r.level, label: r.label, era: tier?.era ?? "", reference: tier?.reference ?? "" },
        t,
      );
      expect(Object.values(card).every(isDiscreet), r.label).toBe(true);
    }
    expect(canShareLevel({ level: 0, label: "Clay", era: "Beginning", reference: "Isaiah 64:8" })).toBe(false);
    expect(canShareLevel({ level: 61, label: "Temptation Dodger", era: "Genesis", reference: "Genesis 39:12" })).toBe(
      false,
    );
    expect(shareable.length).toBeGreaterThan(990);
  });
});

describe("level copy: grace, not shame (§2.1)", () => {
  const words =
    /\b(fail\w*|relapse\w*|shame\w*|ashamed|ruin\w*|broke|broken|weak\w*|disappoint\w*|bad|wasted|lost|missed)\b/i;
  it("no failure words, and a level-down never says 'missed'", () => {
    const all = JSON.stringify(en.levels);
    expect(all).not.toMatch(words);
    expect(en.levels.down).toContain("still yours");
  });
});
