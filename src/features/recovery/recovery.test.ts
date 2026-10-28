import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { isDiscreet } from "../../lib/discretion";
import { formatClock, JOURNAL_PROMPTS, promptOfTheDay, SOS_CARDS, WAVE_SECONDS } from "./constants";
import { CRISIS_LINES, countryForTimeZone, orderedCrisisLines } from "./crisis-lines";
import { mentionsSelfHarm } from "./crisis-match";
import { dialable, journalBodySchema, parseJournalCursor, phoneSchema } from "./schemas";
import { uuidV7 } from "./server/uuid";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("on-device crisis matching (§7.9, D-109)", () => {
  it.each([
    "I want to die",
    "honestly I just want to DIE tonight",
    "sometimes I think about killing myself",
    "I’ve been cutting myself again",
    "thinking about suicide",
    "everyone would be better off without me",
    "I can’t go on like this",
    "self harm",
    "I don't want to live anymore",
  ])("notices %j", (text) => {
    expect(mentionsSelfHarm(text)).toBe(true);
  });

  it.each([
    "",
    "This homework is killing me",
    "I almost died laughing",
    "Prayed for my friend today",
    "We watched a documentary about the Dead Sea",
    "I slipped last night but I'm here",
  ])("stays quiet for %j", (text) => {
    expect(mentionsSelfHarm(text)).toBe(false);
  });

  it("never sends anything: the matcher and the card make no network calls and log nothing", () => {
    for (const file of ["src/features/recovery/crisis-match.ts", "src/features/recovery/components/crisis-watch.tsx"]) {
      const code = read(file);
      expect(code, file).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|console\.|"use server"|Action\b/);
    }
  });
});

describe("crisis lines (§7.9)", () => {
  it("India (Tele-MANAS 14416) and the US (988) are there, as the spec names them", () => {
    expect(CRISIS_LINES.find((l) => l.code === "IN")).toMatchObject({ name: "Tele-MANAS", dial: "14416" });
    expect(CRISIS_LINES.find((l) => l.code === "US")).toMatchObject({ dial: "988" });
  });

  it("the person's own country comes first, then India and the US", () => {
    expect(
      orderedCrisisLines("Europe/London")
        .map((l) => l.code)
        .slice(0, 3),
    ).toEqual(["GB", "IN", "US"]);
    expect(orderedCrisisLines("Asia/Kolkata")[0]!.code).toBe("IN");
    expect(
      orderedCrisisLines("America/Chicago")
        .map((l) => l.code)
        .slice(0, 2),
    ).toEqual(["US", "IN"]);
    expect(
      orderedCrisisLines("Antarctica/Troll")
        .map((l) => l.code)
        .slice(0, 2),
    ).toEqual(["IN", "US"]);
    expect(countryForTimeZone("Australia/Sydney")).toBe("AU");
  });

  it("every number can be dialled", () => {
    for (const l of CRISIS_LINES) expect(l.dial, l.country).toMatch(/^\d{3,12}$/);
  });
});

describe("the SOS sheet's copy: grace, not shame (§2.1)", () => {
  const failure = /\b(fail\w*|relapse\w*|shame\w*|ashamed|gave in|give in|weak\w*|broke|broken|lost|reset)\b/i;

  it("the timer and the tally never show or count a failure", () => {
    for (const text of [...Object.values(en.sos.wave), ...Object.values(en.sos.tally)]) {
      expect(text).not.toMatch(failure);
    }
    expect(en.sos.wave.stopped).toBe("That’s okay. You reached out.");
    expect(en.sos.tally.count).not.toMatch(/\bof\b|%|rate|missed|gap/i);
  });

  it("SOS assumes nothing about whether someone has slipped, and keeps the after-slip words", () => {
    const { afterSlip, afterSlipText, afterSlipNext, afterSlipReference, afterSlipLink, ...rest } = en.sos;
    expect([afterSlip, afterSlipText, afterSlipNext, afterSlipReference, afterSlipLink].every(Boolean)).toBe(true);
    expect(JSON.stringify(rest)).not.toMatch(/\byou (slipped|relapsed|failed)\b/i);
  });

  it("five Scripture cards, from the World English Bible, as §7.9 lists them", () => {
    expect(SOS_CARDS).toHaveLength(5);
    const refs = SOS_CARDS.map((c) => en.sos.cards[c].reference);
    expect(refs).toEqual([
      "1 Corinthians 10:13 (WEB)",
      "James 4:7 (WEB)",
      "Philippians 4:8 (WEB)",
      "Psalm 119:9–11 (WEB)",
      "Galatians 5:16 (WEB)",
    ]);
  });

  it("the timer is ten minutes", () => {
    expect(WAVE_SECONDS).toBe(600);
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(59.2)).toBe("1:00");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("the journal (§7.9, D-108)", () => {
  it("prompts invite reflection, never confession on demand", () => {
    expect(JOURNAL_PROMPTS).toHaveLength(30);
    for (const key of JOURNAL_PROMPTS) {
      const prompt = en.journal.prompts[key as keyof typeof en.journal.prompts];
      expect(prompt, key).toBeTruthy();
      expect(prompt, key).not.toMatch(/confess|what did you do|admit|slip|relapse|why did you|sin\b/i);
    }
  });

  it("a different question each day, the same one all day", () => {
    expect(promptOfTheDay("2026-10-22")).toBe(promptOfTheDay("2026-10-22"));
    expect(promptOfTheDay("2026-10-22")).not.toBe(promptOfTheDay("2026-10-23"));
    expect(JOURNAL_PROMPTS).toContain(promptOfTheDay("1999-01-01"));
  });

  it("entries are 1 to 5,000 characters", () => {
    expect(journalBodySchema.safeParse("  ").success).toBe(false);
    expect(journalBodySchema.safeParse("a".repeat(5000)).success).toBe(true);
    expect(journalBodySchema.safeParse("a".repeat(5001)).success).toBe(false);
  });

  it("odd cursors start at the newest", () => {
    expect(parseJournalCursor("2026-10-22T08:00:00.000Z", "0199a000-0000-7000-8000-000000000001")).not.toBeNull();
    expect(parseJournalCursor("yesterday", "0199a000-0000-7000-8000-000000000001")).toBeNull();
    expect(parseJournalCursor("2026-10-22T08:00:00Z", "1 or 1=1")).toBeNull();
  });

  it("ids are UUIDv7, like the database's own", () => {
    const id = uuidV7(Date.parse("2026-10-22T00:00:00Z"));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.slice(0, 13)).toBe(uuidV7(Date.parse("2026-10-22T00:00:00Z")).slice(0, 13));
  });

  it("the server encrypts every entry before it reaches the database, bound to its author and id", () => {
    const actions = read("src/features/recovery/server/actions.ts");
    expect(actions).toMatch(/p_body_encrypted: encryptText\(body\.data, journalContext\(userId, id\)\)/);
    expect(actions).not.toMatch(/audit\(/);
  });
});

describe("the number partners can call (D-107)", () => {
  it("accepts real numbers and refuses anything else", () => {
    for (const ok of ["+91 98765 43210", "(555) 010-2030", "+44 20 7946 0958"]) {
      expect(phoneSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ["call me", "12345", "+1 234 567 890 123 456", "javascript:alert(1)"]) {
      expect(phoneSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("dials digits only", () => {
    expect(dialable("+91 98765-43210")).toEqual({ tel: "+919876543210", whatsapp: "919876543210" });
    expect(dialable("(555) 010 2030")).toEqual({ tel: "5550102030", whatsapp: "5550102030" });
  });
});

describe("discretion (§2.3, D-055)", () => {
  it("the new page titles and the offline page's title say nothing about the topic", () => {
    for (const key of ["journal", "journalEntry", "resources", "breathe"] as const) {
      expect(isDiscreet(en.meta[key]), key).toBe(true);
    }
    expect(isDiscreet(en.sos.offlinePage.title)).toBe(true);
  });

  it("the service worker keeps /breathe for offline SOS (D-106, now with /offline: D-124)", () => {
    const sw = read("public/sw.js");
    expect(sw).toMatch(/var BREATHE_PAGE = "\/breathe";/);
    expect(sw).toMatch(/var SHELL_PAGES = \[OFFLINE_PAGE, BREATHE_PAGE\];/);
    expect(sw).toMatch(/credentials: "omit"/);
  });
});
