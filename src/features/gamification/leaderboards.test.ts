import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { SENSITIVE_WORDS } from "../../lib/discretion";
import { GOAL_PERIODS } from "../groups/constants";
import {
  BOARDS,
  MAX_AFTER,
  PAGE_SIZE,
  boardHasWeek,
  boardHref,
  boardShowsEveryone,
  goalPercent,
  parseBoardQuery,
} from "./leaderboards";

const GROUP = "0199a000-0000-7000-8000-000000000001";

describe("leaderboards: boards and views (§7.6, D-074)", () => {
  it("has the five boards, Consistency XP first (the default)", () => {
    expect(BOARDS).toEqual(["xp", "level", "streak", "free_days", "encourager"]);
    expect(parseBoardQuery({}).board).toBe("xp");
  });

  it("offers this week only where it means something (owner, 2026-10-12)", () => {
    expect(BOARDS.filter(boardHasWeek)).toEqual(["xp", "free_days", "encourager"]);
  });

  it("puts checkin_only members only on XP and Encourager", () => {
    expect(BOARDS.filter(boardShowsEveryone)).toEqual(["xp", "encourager"]);
  });

  it("reads the URL safely", () => {
    expect(parseBoardQuery({ board: "3", period: "week" })).toEqual({ board: "streak", period: "all", after: 0 });
    expect(parseBoardQuery({ board: "4", period: "week", after: "50" })).toEqual({
      board: "free_days",
      period: "week",
      after: 50,
    });
    expect(parseBoardQuery({ board: "<script>", period: "ever", after: "-5" })).toEqual({
      board: "xp",
      period: "all",
      after: 0,
    });
    expect(parseBoardQuery({ after: "73" }).after).toBe(50);
    expect(parseBoardQuery({ after: String(MAX_AFTER + PAGE_SIZE) }).after).toBe(0);
    expect(parseBoardQuery({ board: ["2", "1"] }).board).toBe("level");
    // Boards go by number in the address, never by name (privacy review 2, D-098).
    expect(parseBoardQuery({ board: "streak" }).board).toBe("xp");
  });

  it("builds links without defaults", () => {
    expect(boardHref(GROUP, "xp")).toBe(`/groups/${GROUP}/leaderboard`);
    expect(boardHref(GROUP, "xp", "week")).toBe(`/groups/${GROUP}/leaderboard?period=week`);
    expect(boardHref(GROUP, "level", "week")).toBe(`/groups/${GROUP}/leaderboard?board=2`);
    expect(boardHref(GROUP, "streak", "all", 100)).toBe(`/groups/${GROUP}/leaderboard?board=3&after=100`);
    for (const board of BOARDS) {
      expect(
        parseBoardQuery(Object.fromEntries(new URL(boardHref(GROUP, board), "https://x.test").searchParams)).board,
      ).toBe(board);
      expect(boardHref(GROUP, board, "week", 50)).not.toMatch(/streak|free|level|encour|xp/);
    }
  });
});

describe("group goal (D-075)", () => {
  it("repeats every week, month, quarter or year (owner, 2026-10-12)", () => {
    expect(GOAL_PERIODS).toEqual(["week", "month", "quarter", "year"]);
    for (const p of GOAL_PERIODS) expect(en.leaderboard.goalForm.periods[p]).toBeTruthy();
  });

  it("fills the bar in whole percent, never past 100", () => {
    expect(goalPercent(0, 500)).toBe(0);
    expect(goalPercent(125, 500)).toBe(25);
    expect(goalPercent(499, 500)).toBe(99);
    expect(goalPercent(800, 500)).toBe(100);
    expect(goalPercent(5, 0)).toBe(0);
  });
});

describe("leaderboard and Together copy: grace, not shame (§2.1)", () => {
  const failure =
    /\b(fail\w*|relapse\w*|shame\w*|ashamed|ruin\w*|broke|broken|weak\w*|disappoint\w*|bad|wasted|lost|missed|lose|loser|last place|worst)\b/i;
  const copy = JSON.stringify([
    en.leaderboard,
    en.groups.inviteDetail,
    en.groups.notices.goalSet,
    en.groups.notices.goalEnded,
  ]);

  it("no failure words", () => {
    expect(copy).not.toMatch(failure);
  });

  it("calls them free days, never clean days (G-3)", () => {
    expect(copy).not.toMatch(/\bclean\b/i);
  });

  it("the tab title gives nothing away", () => {
    expect(en.meta.groupLeaderboard).not.toMatch(SENSITIVE_WORDS);
  });
});

describe("hiding tells members the owner and admins still see them (D-088)", () => {
  const sayOwnersSee = /owner and admins (can )?(still )?see/i;

  it("in the note on the board, the covenant and the hide checkbox", () => {
    expect(en.leaderboard.hiddenNote).toMatch(sayOwnersSee);
    expect(en.groups.covenantInfo.hidingAllowed).toMatch(sayOwnersSee);
    expect(en.groups.fields.leaderboardHiddenHint).toMatch(sayOwnersSee);
  });

  it("owners and admins see a hidden member marked as such", () => {
    expect(en.leaderboard.hiddenFromMembers).toBe("Hidden from members");
  });
});
