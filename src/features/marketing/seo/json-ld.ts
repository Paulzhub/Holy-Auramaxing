/**
 * Structured data for the public pages (CLAUDE.md §12): Organization,
 * WebSite, WebApplication, FAQPage, BlogPosting and BreadcrumbList.
 * Builders are pure so tests can check Google's required fields.
 */
import type { Article } from "../articles";
import { absoluteUrl, CONTACT_EMAIL, SITE_NAME, siteUrl } from "../site";

export type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";
const orgId = () => `${siteUrl()}/#organization`;
const siteId = () => `${siteUrl()}/#website`;

export function organizationLd(description: string): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": orgId(),
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icons/icon-512.png"),
    description,
    email: CONTACT_EMAIL,
  };
}

export function websiteLd(description: string): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": siteId(),
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description,
    inLanguage: "en",
    publisher: { "@id": orgId() },
  };
}

export function webApplicationLd(description: string): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebApplication",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires a modern web browser with JavaScript.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": orgId() },
  };
}

export function faqPageLd(items: ReadonlyArray<{ question: string; answer: string }>): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbLd(crumbs: readonly Crumb[]): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export function blogPostingLd(article: Article, path: string, imagePath: string): JsonLd {
  const person = (p: { name: string; role: string }) => ({ "@type": "Person", name: p.name, jobTitle: p.role });
  return {
    "@context": CONTEXT,
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    image: [absoluteUrl(imagePath)],
    datePublished: article.published,
    dateModified: article.updated,
    author: [{ ...person(article.author), url: absoluteUrl("/about") }],
    publisher: { "@id": orgId() },
    // reviewedBy belongs to the page (schema.org WebPage), not the posting.
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(path),
      ...(article.reviewer ? { reviewedBy: person(article.reviewer) } : {}),
    },
    inLanguage: "en",
    citation: article.sources.map((s) => s.url),
  };
}

/**
 * JSON for an inline <script type="application/ld+json">. "<" is escaped so
 * no string can close the script element (Next.js JSON-LD guide).
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
