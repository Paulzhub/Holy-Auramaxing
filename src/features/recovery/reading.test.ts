import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { isDiscreet } from "../../lib/discretion";
import { nextUnreadDay, parsePassages, parsePlanDay, planBySlug, READING_PLANS, verseDayOfYear } from "./reading";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

interface VerseFile {
  verses: { day: number; reference: string; text: string }[];
}
interface PlanFile {
  plans: { slug: string; titleKey: string; length: number; days: { day: number; passages: { ref: string }[] }[] }[];
}
const votd = JSON.parse(read("data/verses_of_day.json")) as VerseFile;
const plans = JSON.parse(read("data/reading_plans.json")) as PlanFile;
const seed = read("supabase/migrations/20261027000200_recovery_devotionals_text.sql");

describe("the verse of the day (§7.9, D-112)", () => {
  it("keeps every date's verse the same each year: 29 February is day 60, 1 March always 61", () => {
    expect(verseDayOfYear("2026-01-01")).toBe(1);
    expect(verseDayOfYear("2028-02-29")).toBe(60);
    expect(verseDayOfYear("2026-03-01")).toBe(61);
    expect(verseDayOfYear("2028-03-01")).toBe(61);
    expect(verseDayOfYear("2026-12-31")).toBe(366);
  });

  it("has 366 different verses, one for every day", () => {
    expect(votd.verses.map((v) => v.day)).toEqual(Array.from({ length: 366 }, (_, i) => i + 1));
    expect(new Set(votd.verses.map((v) => v.reference)).size).toBe(366);
  });

  it("never repeats a level or badge verse", () => {
    const used = new Set([
      ...Object.keys((JSON.parse(read("data/level_verses.json")) as { verses: object }).verses),
      ...Object.keys((JSON.parse(read("data/badge_verses.json")) as { verses: object }).verses),
    ]);
    expect(votd.verses.filter((v) => used.has(v.reference))).toEqual([]);
  });

  it("pairs its quotation marks, and never names the topic at a glance", () => {
    for (const { reference, text } of votd.verses) {
      let open = 0;
      for (const c of text) {
        if (c === "“") open++;
        if (c === "”") {
          expect(open, reference).toBeGreaterThan(0);
          open--;
        }
      }
      expect(open, reference).toBe(0);
      expect(text, reference).not.toMatch(/lust|sexual|porn|adulter|fornicat/i);
    }
  });

  it("is seeded exactly as the data file says (scripts/build-devotionals.mjs)", () => {
    const sql = (s: string) => `'${s.replace(/'/g, "''")}'`;
    for (const v of votd.verses) expect(seed).toContain(`  (${v.day}, ${sql(v.reference)}, ${sql(v.text)})`);
  });
});

describe("the reading plans (§7.9, D-112)", () => {
  it("are the owner's three, with neutral slugs", () => {
    expect(plans.plans.map((p) => [p.slug, p.length])).toEqual(READING_PLANS.map((p) => [p.slug, p.length]));
    for (const p of READING_PLANS) {
      expect(p.slug).toMatch(/^\d+-days$/);
      expect(planBySlug(p.slug)).toBe(p);
    }
    expect(planBySlug("free-in-christ")).toBeNull();
  });

  it("read whole chapters: the seven-day plan, John then Ephesians and Philippians, and the whole New Testament", () => {
    const refs = (slug: string) =>
      plans.plans.find((p) => p.slug === slug)!.days.map((d) => d.passages.map((x) => x.ref).join(" + "));
    expect(refs("7-days")).toEqual([
      "Romans 6",
      "Romans 8",
      "Galatians 5",
      "1 Corinthians 10",
      "Psalm 51",
      "James 1",
      "Philippians 4",
    ]);
    const thirty = refs("30-days");
    expect(thirty.slice(0, 21)).toEqual(Array.from({ length: 21 }, (_, i) => `John ${i + 1}`));
    expect(thirty.slice(21)).toEqual([
      ...Array.from({ length: 6 }, (_, i) => `Ephesians ${i + 1}`),
      "Philippians 1 + Philippians 2",
      "Philippians 3",
      "Philippians 4",
    ]);
    const nt = plans.plans.find((p) => p.slug === "90-days")!.days.flatMap((d) => d.passages.map((x) => x.ref));
    expect(nt).toHaveLength(260);
    expect(nt[0]).toBe("Matthew 1");
    expect(nt.at(-1)).toBe("Revelation 22");
  });

  it("are seeded exactly as the data file says", () => {
    for (const p of plans.plans)
      for (const d of p.days) {
        const refs = d.passages.map((x) => `'${x.ref}'`).join(", ");
        expect(seed).toContain(`  ('${p.slug}', ${d.day}, array[${refs}], $j$`);
      }
  });

  it("know where someone is without any dates, so nothing can be 'behind'", () => {
    expect(nextUnreadDay(7, new Set())).toBe(1);
    expect(nextUnreadDay(7, new Set([1, 2, 4]))).toBe(3);
    expect(nextUnreadDay(3, new Set([1, 2, 3]))).toBeNull();
  });

  it("take only a day number the plan has from the address", () => {
    expect(parsePlanDay("5", 7)).toBe(5);
    expect(parsePlanDay("8", 7)).toBeNull();
    expect(parsePlanDay("0", 7)).toBeNull();
    expect(parsePlanDay("2; drop", 30)).toBeNull();
    expect(parsePlanDay(["1"], 30)).toBeNull();
  });

  it("show only passages in the expected shape", () => {
    expect(parsePassages([{ ref: "John 1", verses: [[1, "In the beginning"]] }])).toHaveLength(1);
    expect(parsePassages({ html: "<script>" })).toEqual([]);
  });

  it("have discreet words on every page and title", () => {
    const entries = [en.meta.reading, en.meta.readingPlan, ...JSON.stringify(en.reading).split('"')];
    expect(entries.filter((s) => !isDiscreet(s))).toEqual([]);
  });
});
