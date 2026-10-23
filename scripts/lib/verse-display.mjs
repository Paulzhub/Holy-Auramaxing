// The one display rule for partial verses (grace review 2, GS-2, D-105), and the
// cuts that keep a level verse kind to read right after a level drop (GR-4).
export const EDITION = "ebible.org eng-web USFM, downloaded 2026-10-22";

/** Keep the text from `from` and/or up to and including `to`. */
export const CUTS = {
  "Matthew 5:13": { to: "You are the salt of the earth" },
  "Matthew 17:20": { from: "if you have faith" },
  "Jeremiah 20:9": { to: "shut up in my bones." },
  "Esther 4:14": { from: "Who knows" },
  "Deuteronomy 30:19": { from: "I have set before you" },
  "Proverbs 6:6": { from: "Consider her ways" },
};

const SENTENCE_END = /[.?!][”’]?$/;

function count(s, ch) {
  return [...s].filter((c) => c === ch).length;
}

export function displayVerse(text, cut) {
  let s = text;
  let cutStart = false;
  let cutEnd = false;
  if (cut?.from) {
    const i = s.indexOf(cut.from);
    if (i < 0) throw new Error(`Cut start not found: ${cut.from}`);
    cutStart = i > 0 && !SENTENCE_END.test(s.slice(0, i).trim());
    s = s.slice(i);
  }
  if (cut?.to) {
    const i = s.indexOf(cut.to);
    if (i < 0) throw new Error(`Cut end not found: ${cut.to}`);
    s = s.slice(0, i + cut.to.length);
    cutEnd = !SENTENCE_END.test(s);
  }
  // Quotation marks: drop one that opens or closes outside the verse, then close any left open.
  if (s.startsWith("“") && count(s, "“") > count(s, "”")) s = s.slice(1);
  if (s.endsWith("”") && count(s, "”") > count(s, "“")) s = s.slice(0, -1);
  s = s.trim();
  // A start mid-sentence, or an end on a comma, semicolon, colon or dash.
  if (cutStart || /^[a-z]/.test(s)) s = `…${s}`;
  if (/[,;:—]$/.test(s)) s = `${s.slice(0, -1)}…`;
  else if (cutEnd) s = `${s}…`;
  if (count(s, "“") > count(s, "”")) s = `${s}”`;
  return s;
}
