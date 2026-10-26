import type { MetadataRoute } from "next";

import { ARTICLES } from "@/features/marketing/articles";
import { articlePath, isIndexablePath, PUBLIC_PAGES, SCRIPTURE_PLAN_PATHS } from "@/features/marketing/pages";
import { absoluteUrl } from "@/features/marketing/site";

/**
 * The XML sitemap (CLAUDE.md §12): indexable public pages only. Nothing
 * behind sign-in, no invites, no auth pages, and no article still waiting
 * for review (D-116). src/test/seo.test.ts checks this.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = PUBLIC_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
  const plans = SCRIPTURE_PLAN_PATHS.map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));
  const articles = ARTICLES.filter((a) => isIndexablePath(articlePath(a.slug))).map((a) => ({
    url: absoluteUrl(articlePath(a.slug)),
    lastModified: a.updated,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [...pages, ...plans, ...articles];
}
