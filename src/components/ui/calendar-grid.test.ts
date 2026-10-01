import { describe, expect, it } from "vitest";

import { buildMonthGrid, weekdayReferenceDates } from "./calendar-grid";

describe("buildMonthGrid", () => {
  it("starts September 2026 on a Tuesday (Monday-first week)", () => {
    const weeks = buildMonthGrid(2026, 9, 1);
    expect(weeks[0]?.[0]).toEqual({ date: null, day: null });
    expect(weeks[0]?.[1]).toEqual({ date: "2026-09-01", day: 1 });
    expect(weeks.flat().filter((c) => c.date)).toHaveLength(30);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("handles Sunday-first weeks", () => {
    const weeks = buildMonthGrid(2026, 9, 0);
    expect(weeks[0]?.[2]?.date).toBe("2026-09-01");
  });

  it("knows leap years", () => {
    expect(
      buildMonthGrid(2028, 2)
        .flat()
        .filter((c) => c.date),
    ).toHaveLength(29);
    expect(
      buildMonthGrid(2027, 2)
        .flat()
        .filter((c) => c.date),
    ).toHaveLength(28);
  });
});

describe("weekdayReferenceDates", () => {
  it("returns seven days starting on the requested weekday", () => {
    expect(weekdayReferenceDates(1).map((d) => d.getUTCDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayReferenceDates(0).map((d) => d.getUTCDay())).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
