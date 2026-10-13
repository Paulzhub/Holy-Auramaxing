import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { isDiscreet } from "../../lib/discretion";
import {
  NUDGE_KINDS,
  PARTNERS_MAX,
  POST_KINDS,
  REACTION_KINDS,
  REPORT_REASONS,
  SOCIAL_LIMITS,
  WALL_FILTERS,
} from "./constants";
import { databaseErrorKeys, socialErrorKey } from "./errors";
import { commentBodySchema, parseWallQuery, postSchema, reportSchema, tidyText } from "./schemas";

const root = join(__dirname, "..", "..", "..");
const migration = readFileSync(join(root, "supabase/migrations/20261017000100_social_wall.sql"), "utf8");

function strings(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe("the wall's lists match the database (D-077)", () => {
  it("post kinds, reactions and report reasons", () => {
    expect(migration).toContain(
      "kind in ('encouragement', 'prayer_request', 'testimony', 'announcement', 'milestone')",
    );
    expect(migration).toContain(`kind in (${REACTION_KINDS.map((k) => `'${k}'`).join(", ")})`);
    expect(migration).toContain(`reason in (${REPORT_REASONS.map((r) => `'${r}'`).join(", ")})`);
  });

  it("length limits", () => {
    expect(migration).toContain(`char_length(body) between 1 and ${SOCIAL_LIMITS.postMax}`);
    expect(migration).toContain(`char_length(body) between 1 and ${SOCIAL_LIMITS.commentMax}`);
    expect(migration).toContain(`char_length(note) between 1 and ${SOCIAL_LIMITS.reportNoteMax}`);
  });
});

describe("nudges and partners match the database (D-082, D-083)", () => {
  const sixB = readFileSync(join(root, "supabase/migrations/20261018000100_social_nudges_partners.sql"), "utf8");
  it("nudge kinds and the partner limit", () => {
    expect(sixB).toContain(`kind in (${[...NUDGE_KINDS, "pray_for_me"].map((k) => `'${k}'`).join(", ")})`);
    expect(sixB).toContain(`('partners_max_per_group', ${PARTNERS_MAX},`);
    expect(sixB).toContain("('milestone_card_min_days', 7,");
  });

  it("every nudge has its words", () => {
    for (const k of [...NUDGE_KINDS, "pray_for_me"] as const) expect(en.social.nudges.kinds[k]).toBeTruthy();
  });
});

describe("messages", () => {
  it("every kind, filter, reaction and reason has its words", () => {
    for (const k of POST_KINDS) expect(en.social.kinds[k]).toBeTruthy();
    for (const f of WALL_FILTERS) expect(en.social.wall.filters[f]).toBeTruthy();
    for (const r of REACTION_KINDS) expect(en.ui.reactions.kinds[r]).toBeTruthy();
    for (const r of REPORT_REASONS) expect(en.social.report.reasons[r]).toBeTruthy();
  });

  it("every error the database raises has a message", () => {
    for (const key of databaseErrorKeys) expect(en.social.errors[key]).toBeTruthy();
    expect(socialErrorKey({ message: "content_blocked" })).toBe("contentBlocked");
    expect(socialErrorKey({ message: "something new" })).toBe("saveFailed");
  });

  it("every notice the pages can show has its words, and the list knows them all", () => {
    const views = readFileSync(join(__dirname, "components/wall-views.tsx"), "utf8");
    for (const key of Object.keys(en.social.notices)) expect(views, key).toContain(`"${key}"`);
  });

  it('G-10: the "strong" reaction reads "With you"', () => {
    expect(en.ui.reactions.kinds.strong).toBe("With you");
  });

  it("no failure or shame words anywhere on the wall", () => {
    const words = /\b(fail\w*|relapse\w*|shame\w*|ashamed|ruin\w*|broke|broken|weak\w*|disappoint\w*|wasted|lost)\b/i;
    const hits = strings(en.social, "social").filter(([, text]) => words.test(text));
    expect(hits).toEqual([]);
  });

  it("tab titles say nothing about what the app is for", () => {
    for (const key of ["groupWall", "groupModeration", "blocked"] as const) {
      expect(isDiscreet(en.meta[key]), key).toBe(true);
    }
  });
});

describe("forms (server-side checks; the database checks again)", () => {
  it("tidies text: line breaks kept, runs of blank lines shortened, controls dropped", () => {
    expect(tidyText("  Hello\r\n\r\n\r\n\r\nfriends\u0007 ")).toBe("Hello\n\nfriends");
    expect(tidyText("a b")).toBe("ab");
  });

  it("keeps markup exactly as typed (it is shown as text)", () => {
    const parsed = postSchema.safeParse({ kind: "encouragement", body: "<script>alert(1)</script>" });
    expect(parsed.success && parsed.data.body).toBe("<script>alert(1)</script>");
  });

  it("refuses empty, too long and unknown kinds", () => {
    expect(postSchema.safeParse({ kind: "encouragement", body: " \n " }).error?.issues[0]?.message).toBe("bodyEmpty");
    expect(
      postSchema.safeParse({ kind: "encouragement", body: "a".repeat(SOCIAL_LIMITS.postMax + 1) }).error?.issues[0]
        ?.message,
    ).toBe("bodyTooLong");
    expect(postSchema.safeParse({ kind: "milestone", body: "hi" }).success).toBe(false);
    expect(commentBodySchema.safeParse("a".repeat(SOCIAL_LIMITS.commentMax + 1)).success).toBe(false);
  });

  it("a report needs a reason", () => {
    const target = "01890000-0000-7000-8000-000000000001";
    expect(reportSchema.safeParse({ targetType: "post", target, reason: "", note: "" }).error?.issues[0]?.message).toBe(
      "reasonMissing",
    );
    expect(reportSchema.safeParse({ targetType: "post", target, reason: "spam", note: "" }).success).toBe(true);
  });

  it("reads ?kind= and ?before= safely", () => {
    expect(parseWallQuery({})).toEqual({ filter: "all", before: null });
    expect(parseWallQuery({ kind: "testimony", before: "01890000-0000-7000-8000-000000000001" })).toEqual({
      filter: "testimony",
      before: "01890000-0000-7000-8000-000000000001",
    });
    expect(parseWallQuery({ kind: "<script>", before: "1 or 1=1" })).toEqual({ filter: "all", before: null });
  });
});

describe("rendering", () => {
  it("never renders anyone's words as HTML", () => {
    const views = readFileSync(join(__dirname, "components/wall-views.tsx"), "utf8");
    const forms = readFileSync(join(__dirname, "components/wall-forms.tsx"), "utf8");
    expect(views).not.toMatch(/dangerouslySetInnerHTML/);
    expect(forms).not.toMatch(/dangerouslySetInnerHTML/);
  });
});

describe("live updates (D-086)", () => {
  const live = readFileSync(join(__dirname, "components/live-group.tsx"), "utf8");
  // Shared with the bell since Phase 7b (one socket per tab).
  const shared = readFileSync(join(root, "src/lib/realtime/client.ts"), "utf8");
  const bell = readFileSync(join(root, "src/features/notifications/components/live-alerts.tsx"), "utf8");

  it("loads the Realtime client only after the page is idle (not in the first load)", () => {
    expect(shared).toContain('import("@supabase/realtime-js")');
    for (const file of [live, bell, shared]) expect(file).not.toMatch(/^import [^t].*realtime-js/m);
    for (const file of [live, bell]) expect(file).toContain("whenIdle(");
  });

  it("has a kill switch and never asks for a session token", () => {
    expect(shared).toContain('process.env.NEXT_PUBLIC_REALTIME_ENABLED !== "false"');
    for (const file of [live, bell, shared]) expect(file).not.toMatch(/accessToken|getSession|auth\./);
  });

  it("pings carry only what changed", () => {
    const sixC = readFileSync(join(root, "supabase/migrations/20261019000100_social_live_updates.sql"), "utf8");
    const sends = [...sixC.matchAll(/realtime\.send\(([^;]*?)\);/gs)].map((m) => m[1] ?? "");
    expect(sends.length).toBe(1);
    expect(sends[0]).toContain("jsonb_build_object('what', p_what)");
  });
});
