/** The FAQ's order (copy in messages: marketing.faq.items.<key>.q / .a). */
export const FAQ_KEYS = [
  "what",
  "who",
  "private",
  "see",
  "slip",
  "levels",
  "therapy",
  "bible",
  "alone",
  "install",
  "delete",
] as const;

export type FaqKey = (typeof FAQ_KEYS)[number];

/** The three shown on the landing page. */
export const FAQ_PREVIEW: readonly FaqKey[] = ["private", "slip", "therapy"];
