/**
 * /llms.txt (CLAUDE.md §12 GEO, llmstxt.org format): the site's name, its
 * one-line description (the same everywhere), what it is and isn't, and
 * links to the public pages. Built from the same copy as the pages.
 */
import en from "../../../messages/en.json";

import { ARTICLES } from "./articles";
import { articlePath, indexablePaths } from "./pages";
import { absoluteUrl, SITE_NAME } from "./site";

const m = en.marketing;

export function llmsText(): string {
  const indexed = new Set(indexablePaths());
  const page = (path: string, title: string, description: string) =>
    `- [${title}](${absoluteUrl(path)}): ${description}`;
  const articles = ARTICLES.filter((a) => indexed.has(articlePath(a.slug)));

  return [
    `# ${SITE_NAME}`,
    "",
    `> ${m.pages.home.description}`,
    "",
    m.faq.items.what.a,
    "",
    `- ${m.llms.adults}`,
    `- ${m.llms.privacy}`,
    `- ${m.llms.notMedical}`,
    `- ${m.llms.bible}`,
    "",
    "## Pages",
    "",
    page("/how-it-works", m.pages.howItWorks.title, m.pages.howItWorks.description),
    page("/faq", m.pages.faq.title, m.pages.faq.description),
    page("/about", m.pages.about.title, m.pages.about.description),
    page("/scripture", m.pages.scripture.title, m.pages.scripture.description),
    page("/get-help", m.pages.getHelp.title, m.pages.getHelp.description),
    page("/your-data", en.legal.yourData.title, en.legal.yourData.lede),
    "",
    ...(articles.length > 0
      ? ["## Articles", "", ...articles.map((a) => page(articlePath(a.slug), a.title, a.description)), ""]
      : []),
    "## Optional",
    "",
    page("/privacy", en.legal.privacy.title, en.legal.privacy.lede),
    page("/terms", en.legal.terms.title, en.legal.terms.lede),
    page("/community-guidelines", en.legal.communityGuidelines.title, en.legal.communityGuidelines.lede),
    "",
  ].join("\n");
}
