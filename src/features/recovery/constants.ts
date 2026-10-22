/** Recovery tools (CLAUDE.md §7.9). Phase 8a. */

/** The "ride the wave" timer: ten minutes. */
export const WAVE_SECONDS = 10 * 60;

/** Moments the timer speaks up (politely): five minutes, one minute and the end. */
export const WAVE_ANNOUNCE_AT = [5 * 60, 60, 0] as const;

/** One breath: in for 4, hold for 4, out for 6 (14 seconds); about a minute is four breaths. */
export const BREATH_PHASES = [
  { key: "in", seconds: 4 },
  { key: "hold", seconds: 4 },
  { key: "out", seconds: 6 },
] as const;
export const BREATH_ROUNDS = 4;
export type BreathPhase = (typeof BREATH_PHASES)[number]["key"];

/** The SOS Scripture cards, in order (messages under sos.cards.<key>). */
export const SOS_CARDS = ["cor10", "jas4", "php4", "psa119", "gal5"] as const;
export type SosCard = (typeof SOS_CARDS)[number];

/** The journal's guided prompts (messages under journal.prompts.<key>). */
export const JOURNAL_PROMPTS = Array.from({ length: 30 }, (_, i) => `p${String(i + 1).padStart(2, "0")}`);
export type JournalPrompt = string;

export const RECOVERY_LIMITS = {
  journalMax: 5000,
  journalPageSize: 20,
  /** E.164 allows 15 digits; a few more characters for spaces and a plus sign. */
  phoneMaxChars: 24,
} as const;

/** The timer's time as text, e.g. "9:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Today's suggested question: a different one each day of the year. */
export function promptOfTheDay(localDate: string): string {
  const day = Math.floor(Date.parse(`${localDate}T00:00:00Z`) / 86_400_000);
  return JOURNAL_PROMPTS[((day % JOURNAL_PROMPTS.length) + JOURNAL_PROMPTS.length) % JOURNAL_PROMPTS.length]!;
}
