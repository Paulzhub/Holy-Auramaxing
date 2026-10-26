/**
 * The public website (CLAUDE.md §12, D-114). This list is the single source
 * for the sitemap, robots.txt, llms.txt, the proxy's noindex header and the
 * tests. A path that isn't here, and isn't a reviewed article or a reading
 * plan preview, is never indexed.
 *
 * Pure data: the proxy imports it, so no React, MDX or server code here.
 */
import { ARTICLES } from "./articles";
import { READING_PLANS } from "../recovery/reading";

export type PublicPageKey =
  | "home"
  | "howItWorks"
  | "about"
  | "faq"
  | "articles"
  | "scripture"
  | "getHelp"
  | "privacy"
  | "terms"
  | "yourData"
  | "communityGuidelines"
  | "accessibility"
  | "security";

export interface PublicPage {
  key: PublicPageKey;
  path: string;
  /** Sitemap hint, 0–1. */
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { key: "home", path: "/", priority: 1, changeFrequency: "monthly" },
  { key: "howItWorks", path: "/how-it-works", priority: 0.9, changeFrequency: "monthly" },
  { key: "about", path: "/about", priority: 0.7, changeFrequency: "yearly" },
  { key: "faq", path: "/faq", priority: 0.8, changeFrequency: "monthly" },
  { key: "articles", path: "/articles", priority: 0.8, changeFrequency: "weekly" },
  { key: "scripture", path: "/scripture", priority: 0.8, changeFrequency: "weekly" },
  { key: "getHelp", path: "/get-help", priority: 0.7, changeFrequency: "monthly" },
  { key: "privacy", path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
  { key: "terms", path: "/terms", priority: 0.4, changeFrequency: "yearly" },
  { key: "yourData", path: "/your-data", priority: 0.5, changeFrequency: "yearly" },
  { key: "communityGuidelines", path: "/community-guidelines", priority: 0.4, changeFrequency: "yearly" },
  { key: "accessibility", path: "/accessibility", priority: 0.4, changeFrequency: "yearly" },
  { key: "security", path: "/security", priority: 0.3, changeFrequency: "yearly" },
];

export function publicPage(key: PublicPageKey): PublicPage {
  return PUBLIC_PAGES.find((p) => p.key === key)!;
}

/** Reading plan previews (the Scripture guides), e.g. /scripture/7-days. */
export const SCRIPTURE_PLAN_PATHS = READING_PLANS.map((p) => `/scripture/${p.slug}`);

export function articlePath(slug: string): string {
  return `/articles/${slug}`;
}

/**
 * Articles are indexed only once a pastor or counsellor has reviewed them
 * (owner, 2026-10-26, D-116). Until then they're public but `noindex`.
 */
export function indexableArticlePaths(): string[] {
  return ARTICLES.filter((a) => a.reviewer !== null).map((a) => articlePath(a.slug));
}

/** Every path a search engine may index, without a locale prefix. */
export function indexablePaths(): string[] {
  return [...PUBLIC_PAGES.map((p) => p.path), ...SCRIPTURE_PLAN_PATHS, ...indexableArticlePaths()];
}

/** Public, crawlable paths (indexed or not): robots.txt allows these. */
export function publicPaths(): string[] {
  return [...PUBLIC_PAGES.map((p) => p.path), ...SCRIPTURE_PLAN_PATHS, ...ARTICLES.map((a) => articlePath(a.slug))];
}

/** True when `path` (no locale prefix, no query) may be indexed. */
export function isIndexablePath(path: string): boolean {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return indexablePaths().includes(clean);
}

/**
 * Never crawled (robots.txt): the signed-in app (the proxy's protected
 * prefixes), invite links, the API and the dev pages. Sign-in, sign-up and
 * /breathe stay crawlable on purpose, so crawlers can see their noindex
 * instead of listing a bare address (D-119). A test checks this list covers
 * every protected prefix.
 */
export const NEVER_CRAWLED = [
  "/home",
  "/groups",
  "/check-in",
  "/alerts",
  "/me",
  "/settings",
  "/welcome",
  "/journal",
  "/resources",
  "/reading",
  "/progress",
  "/join",
  "/api",
  "/dev",
] as const;

/** AI crawlers named in §12: allowed on public pages only, like everyone else. */
export const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"] as const;
