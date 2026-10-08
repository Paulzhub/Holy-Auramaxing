// @vitest-environment node
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { lineSegments } from "./components/charts";
import { TRIGGERS } from "./constants";
import { checkinErrorKey, checkinErrorKeys, isCheckinErrorKey } from "./errors";
import { buildInsights, MIN_DAYS_FOR_INSIGHTS, triggerCounts, weekdayOf, type DayRecord } from "./insights";
import { nextStepFor } from "./next-steps";
import { readCheckinForm, readReflectionForm } from "./schemas";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
}

function day(date: string, overrides: Partial<DayRecord> = {}): DayRecord {
  return { date, outcome: "clean", mood: null, urge: null, triggers: [], ...overrides };
}

describe("check-in form", () => {
  it("accepts an answer with every optional detail", () => {
    const parsed = readCheckinForm(
      form([
        ["date", "2026-10-08"],
        ["outcome", "slipped"],
        ["mood", "2"],
        ["urge", "4"],
        ["triggers", "lonely"],
        ["triggers", "late_night"],
        ["note", "  a quiet note \r\n"],
      ]),
    );
    expect(parsed.success && parsed.data).toEqual({
      date: "2026-10-08",
      outcome: "slipped",
      mood: 2,
      urge: 4,
      triggers: ["lonely", "late_night"],
      note: "a quiet note",
    });
  });

  it("treats skipped scales and an empty note as not answered", () => {
    const parsed = readCheckinForm(
      form([
        ["date", "2026-10-08"],
        ["outcome", "clean"],
        ["mood", ""],
        ["urge", ""],
      ]),
    );
    expect(parsed.success && parsed.data).toMatchObject({ mood: null, urge: null, triggers: [], note: "" });
  });

  it.each([
    ["outcome", "relapsed"],
    ["mood", "6"],
    ["urge", "-1"],
    ["triggers", "boredom"],
    ["note", "x".repeat(1001)],
    ["date", "08/10/2026"],
  ])("refuses a bad %s", (field, value) => {
    const base: Record<string, string> = { date: "2026-10-08", outcome: "clean" };
    base[field] = value;
    expect(readCheckinForm(form(Object.entries(base))).success).toBe(false);
  });

  it("validates the reflection the same way", () => {
    expect(
      readReflectionForm(
        form([
          ["date", "2026-10-08"],
          ["triggers", "tired"],
        ]),
      ).success,
    ).toBe(true);
    expect(
      readReflectionForm(
        form([
          ["date", "2026-10-08"],
          ["triggers", "nope"],
        ]),
      ).success,
    ).toBe(false);
  });
});

describe("errors", () => {
  it("maps database keys and falls back to saveFailed", () => {
    expect(checkinErrorKey({ message: "checkin_window_closed" })).toBe("windowClosed");
    expect(checkinErrorKey({ message: "something else" })).toBe("saveFailed");
  });

  it("has copy for every key, and only known keys pass through ?error=", () => {
    for (const key of checkinErrorKeys) expect(en.checkins.errors[key]).toBeTruthy();
    expect(isCheckinErrorKey("windowClosed")).toBe(true);
    expect(isCheckinErrorKey("<script>")).toBe(false);
  });
});

describe("insights", () => {
  it("asks for a few more check-ins at first", () => {
    expect(buildInsights([day("2026-10-01")])).toEqual([
      { key: "notEnough", values: { needed: MIN_DAYS_FOR_INSIGHTS - 1 } },
    ]);
  });

  it("leads with the free days, then what comes up most", () => {
    const days = [
      day("2026-10-01", { triggers: ["tired"] }),
      day("2026-10-02", { triggers: ["tired", "late_night"] }),
      day("2026-10-03", { triggers: ["late_night", "tired"] }),
      day("2026-10-04"),
      day("2026-10-05", { outcome: "slipped" }),
    ];
    const insights = buildInsights(days);
    expect(insights[0]).toEqual({ key: "freeDays", values: { clean: 4, total: 5 } });
    expect(insights[1]).toEqual({ key: "topTriggers", values: { first: "tired", second: "late_night" } });
  });

  it("notices stronger urges on weekdays and on one weekday in particular", () => {
    // October 2026: the 5th, 12th and 19th are Mondays; the 10th, 11th, 17th and 18th are a weekend.
    const days = [
      day("2026-10-05", { urge: 4 }),
      day("2026-10-12", { urge: 5 }),
      day("2026-10-19", { urge: 4 }),
      day("2026-10-06", { urge: 1 }),
      day("2026-10-10", { urge: 0 }),
      day("2026-10-11", { urge: 1 }),
      day("2026-10-17", { urge: 0 }),
    ];
    const keys = buildInsights(days, 10).map((i) => i.key);
    expect(keys).toContain("urgesWeekdays");
    expect(buildInsights(days, 10).find((i) => i.key === "urgesOnDay")?.values).toEqual({ weekday: 1 });
  });

  it("sees mood lifting, and low moods travelling with strong urges", () => {
    const days = ["01", "02", "03", "04", "05", "06"].map((d, i) =>
      day(`2026-10-${d}`, { mood: i < 3 ? 2 : 5, urge: i < 3 ? 4 : 1 }),
    );
    const keys = buildInsights(days, 10).map((i) => i.key);
    expect(keys).toContain("moodRising");
    expect(keys).toContain("lowMoodUrges");
  });

  it("counts every trigger in the fixed order", () => {
    const counts = triggerCounts([day("2026-10-01", { triggers: ["other", "bored"] })]);
    expect(counts.map((c) => c.trigger)).toEqual([...TRIGGERS]);
    expect(counts.find((c) => c.trigger === "bored")?.count).toBe(1);
  });

  it("knows the weekday of a date without time-zone drift", () => {
    expect(weekdayOf("2026-10-08")).toBe(4);
  });
});

describe("charts and next steps", () => {
  it("breaks the line on a missed day", () => {
    const segments = lineSegments([
      { date: "2026-10-01", value: 3 },
      { date: "2026-10-02", value: 4 },
      { date: "2026-10-03", value: null },
      { date: "2026-10-04", value: 2 },
    ]);
    expect(segments.map((s) => s.map((p) => p.date))).toEqual([["2026-10-01", "2026-10-02"], ["2026-10-04"]]);
  });

  it("varies the suggested next step by day", () => {
    const steps = new Set(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].map(nextStepFor));
    expect(steps.size).toBe(4);
  });
});

describe("copy: grace, not shame (§2.1)", () => {
  const words = /\b(fail\w*|relapse\w*|shame\w*|ashamed|ruin\w*|broke|broken|weak\w*|disappoint\w*|bad|wasted|lost)\b/i;
  const strings = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : value && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];

  it("check-in copy never uses failure words", () => {
    const offending = strings(en.checkins).filter((s) => words.test(s));
    expect(offending).toEqual([]);
  });

  it("a slip is described gently on the calendar too", () => {
    expect(en.ui.calendar.status.slipped).not.toMatch(words);
  });
});
