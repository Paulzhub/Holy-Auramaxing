// Reads the World English Bible's USFM files (ebible.org "eng-web_usfm.zip",
// unzipped) into plain verse text. Used only by scripts/build-scripture.mjs,
// never by the app. Footnotes, cross references and Strong's numbers are
// dropped; headings, Psalm titles and verse numbers are not part of a verse.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** USFM book codes for the 66 books, with the names the app uses. */
export const BOOKS = {
  GEN: "Genesis",
  EXO: "Exodus",
  LEV: "Leviticus",
  NUM: "Numbers",
  DEU: "Deuteronomy",
  JOS: "Joshua",
  JDG: "Judges",
  RUT: "Ruth",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  EZR: "Ezra",
  NEH: "Nehemiah",
  EST: "Esther",
  JOB: "Job",
  PSA: "Psalm",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Songs",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  DAN: "Daniel",
  HOS: "Hosea",
  JOL: "Joel",
  AMO: "Amos",
  OBA: "Obadiah",
  JON: "Jonah",
  MIC: "Micah",
  NAM: "Nahum",
  HAB: "Habakkuk",
  ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah",
  MAL: "Malachi",
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation",
};

const DROP_PARA = /^\\(id|ide|h|toc\d|mt\d?|ms\d?|mr|s\d?|sr|r|d|sp|cl|rem|is\d?|ip|imt\d?|io\d?|iot)\b/;

function cleanInline(s) {
  return s
    .replace(/\\f\s.*?\\f\*/g, "")
    .replace(/\\x\s.*?\\x\*/g, "")
    .replace(/\\\+?w\s+([^|\\]*?)(\|[^\\]*)?\\\+?w\*/g, "$1")
    .replace(/\\\+?[a-z]+\d?\*/g, "")
    .replace(/\\\+?[a-z]+\d?\s?/g, "");
}

/** { "Genesis": { 1: { 1: "In the beginning…" } } } */
export function loadBible(dir) {
  const bible = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".usfm"))) {
    const text = readFileSync(join(dir, file), "utf8");
    const code = /^\\id\s+(\S+)/m.exec(text)?.[1];
    const book = code && BOOKS[code];
    if (!book) continue;
    const chapters = (bible[book] = {});
    let ch = 0;
    let v = 0;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || DROP_PARA.test(line)) continue;
      const c = /^\\c\s+(\d+)/.exec(line);
      if (c) {
        ch = Number(c[1]);
        chapters[ch] = {};
        v = 0;
        continue;
      }
      // A line can hold paragraph markers and several verses.
      let rest = line.replace(/^\\(p|m|pi\d?|q\d?|qm\d?|qr|qc|li\d?|nb|pmo|pm|b)\b\s*/, "");
      const parts = rest.split(/\\v\s+(\d+)\s*/);
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
          v = Number(parts[i]);
          chapters[ch][v] = chapters[ch][v] ?? "";
          continue;
        }
        if (!ch || !v) continue;
        const piece = cleanInline(parts[i]).trim();
        if (piece) chapters[ch][v] = `${chapters[ch][v]} ${piece}`.trim();
      }
    }
  }
  for (const b of Object.values(bible))
    for (const c of Object.values(b))
      for (const k of Object.keys(c))
        c[k] = c[k]
          .replace(/\s+/g, " ")
          .replace(/\s+([,.;:!?’”])/g, "$1")
          .trim();
  return bible;
}

/** "Psalm 119:9–11" or "Psalm 119:9-11" → joined verse text. */
export function passage(bible, ref) {
  const m = /^(.+?) (\d+):(\d+)(?:[–-](\d+))?$/.exec(ref);
  if (!m) throw new Error(`Bad reference: ${ref}`);
  const [, book, ch, from, to] = m;
  const out = [];
  for (let v = Number(from); v <= Number(to ?? from); v++) {
    const t = bible[book]?.[Number(ch)]?.[v];
    if (!t) throw new Error(`Missing verse: ${book} ${ch}:${v}`);
    out.push(t);
  }
  return out.join(" ");
}
