/**
 * On-device detection of self-harm language (CLAUDE.md §7.9, D-109). It runs
 * only in the browser, as someone types in the journal or on the wall: the
 * text is never sent anywhere because of it, nothing is logged, and nothing is
 * blocked. A match only shows a gentle card with crisis lines.
 *
 * Phrases, not single words, to keep false alarms low ("this is killing me"
 * about homework shouldn't trigger it). Matching ignores case, extra spaces
 * and curly apostrophes. Missing a real cry for help is worse than an
 * occasional gentle card, so the list leans towards showing it.
 */
const PHRASES = [
  "kill myself",
  "killing myself",
  "end my life",
  "ending my life",
  "take my own life",
  "taking my own life",
  "want to die",
  "wanna die",
  "wish i was dead",
  "wish i were dead",
  "better off dead",
  "better off without me",
  "no reason to live",
  "nothing to live for",
  "don't want to live",
  "dont want to live",
  "don't want to be alive",
  "can't go on",
  "cant go on",
  "not worth living",
  "suicide",
  "suicidal",
  "self harm",
  "self-harm",
  "selfharm",
  "hurt myself",
  "hurting myself",
  "harm myself",
  "harming myself",
  "cut myself",
  "cutting myself",
  "overdose",
  "end it all",
] as const;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ");
}

const PATTERN = new RegExp(
  `(^|[^a-z])(${PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&").replace(/ /g, " ?")).join("|")})($|[^a-z])`,
);

export function mentionsSelfHarm(text: string): boolean {
  if (!text || text.length < 4) return false;
  return PATTERN.test(normalise(text));
}
