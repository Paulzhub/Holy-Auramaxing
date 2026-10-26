// The three reading plans (owner's defaults, 2026-10-22, D-112). Each day is a
// list of whole chapters ("John 3"); build-devotionals.mjs fills in the text.
import { BOOKS } from "./usfm.mjs";

const chapters = (book, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${book} ${from + i}`);

/** "Free in Christ": seven chapters, one a day. */
const sevenDays = [
  "Romans 6",
  "Romans 8",
  "Galatians 5",
  "1 Corinthians 10",
  "Psalm 51",
  "James 1",
  "Philippians 4",
].map((c) => [c]);

/** John (days 1–21), Ephesians (22–27), then Philippians 1–2, 3 and 4 (28–30). */
const thirtyDays = [
  ...chapters("John", 1, 21).map((c) => [c]),
  ...chapters("Ephesians", 1, 6).map((c) => [c]),
  ["Philippians 1", "Philippians 2"],
  ["Philippians 3"],
  ["Philippians 4"],
];

/**
 * The New Testament in 90 days: 260 whole chapters, split into 90 runs of
 * nearly equal length (by verse count), never breaking a chapter. The split
 * minimises the squared distance of each day from the average.
 */
export function newTestamentDays(bible, days = 90) {
  const nt = Object.values(BOOKS).slice(Object.values(BOOKS).indexOf("Matthew"));
  const list = nt.flatMap((book) =>
    Object.keys(bible[book])
      .map(Number)
      .sort((a, b) => a - b)
      .map((c) => ({ ref: `${book} ${c}`, size: Object.keys(bible[book][c]).length })),
  );
  const n = list.length;
  const prefix = [0];
  for (const c of list) prefix.push(prefix.at(-1) + c.size);
  const mean = prefix[n] / days;
  const cost = (i, j) => (prefix[j] - prefix[i] - mean) ** 2;
  // best[k][j]: the cheapest split of the first j chapters into k days.
  const best = Array.from({ length: days + 1 }, () => new Array(n + 1).fill(Infinity));
  const from = Array.from({ length: days + 1 }, () => new Array(n + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= days; k++)
    for (let j = k; j <= n - (days - k); j++)
      for (let i = k - 1; i < j; i++) {
        const c = best[k - 1][i] + cost(i, j);
        if (c < best[k][j]) {
          best[k][j] = c;
          from[k][j] = i;
        }
      }
  const out = [];
  for (let k = days, j = n; k > 0; k--) {
    const i = from[k][j];
    out.unshift(list.slice(i, j).map((c) => c.ref));
    j = i;
  }
  return out;
}

export function readingPlans(bible) {
  return [
    { slug: "7-days", titleKey: "p7", days: sevenDays },
    { slug: "30-days", titleKey: "p30", days: thirtyDays },
    { slug: "90-days", titleKey: "p90", days: newTestamentDays(bible) },
  ];
}
