import { describe, expect, it } from "vitest";

import { daysBetween, groupPhase, todayIn } from "./lifecycle";

const base = { group_timezone: "UTC", archived_at: null };

describe("todayIn", () => {
  it("uses the group's time zone, not the server's", () => {
    // 20:00 UTC on 1 March is already 2 March in Kolkata (UTC+5:30).
    const now = new Date("2026-03-01T20:00:00Z");
    expect(todayIn("UTC", now)).toBe("2026-03-01");
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-03-02");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-03-01");
  });
});

describe("daysBetween", () => {
  it("counts whole days, across a daylight-saving change", () => {
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetween("2026-03-31", "2026-03-01")).toBe(-30);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("groupPhase", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("is scheduled before the start date", () => {
    expect(groupPhase({ ...base, start_date: "2026-03-13", end_date: "2026-04-11" }, now)).toEqual({
      phase: "scheduled",
      startsIn: 3,
    });
  });

  it("counts the start date as day 1, and the end date as the last day", () => {
    expect(groupPhase({ ...base, start_date: "2026-03-10", end_date: "2026-04-08" }, now)).toEqual({
      phase: "active",
      day: 1,
      total: 30,
    });
    expect(groupPhase({ ...base, start_date: "2026-02-09", end_date: "2026-03-10" }, now)).toEqual({
      phase: "active",
      day: 30,
      total: 30,
    });
  });

  it("is completed the day after the end date", () => {
    expect(groupPhase({ ...base, start_date: "2026-02-08", end_date: "2026-03-09" }, now)).toEqual({
      phase: "completed",
      total: 30,
    });
  });

  it("has no total for an ongoing group", () => {
    expect(groupPhase({ ...base, start_date: "2026-01-01", end_date: null }, now)).toEqual({
      phase: "active",
      day: 69,
      total: null,
    });
  });

  it("follows the group's time zone", () => {
    const late = new Date("2026-03-09T20:00:00Z"); // already 10 March in Kolkata
    const group = { start_date: "2026-03-10", end_date: null, archived_at: null };
    expect(groupPhase({ ...group, group_timezone: "UTC" }, late).phase).toBe("scheduled");
    expect(groupPhase({ ...group, group_timezone: "Asia/Kolkata" }, late)).toEqual({
      phase: "active",
      day: 1,
      total: null,
    });
  });

  it("is archived whatever the dates", () => {
    expect(
      groupPhase({ ...base, start_date: "2026-03-01", end_date: null, archived_at: "2026-03-05T00:00:00Z" }, now),
    ).toEqual({ phase: "archived" });
  });
});
