import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { ALL_ARTICLES, ARTICLES, articleSchema, checkArticle } from "../features/marketing/articles";
import { FAQ_KEYS } from "../features/marketing/faq";
import { llmsText } from "../features/marketing/llms";
import {
  AI_CRAWLERS,
  articlePath,
  indexablePaths,
  isIndexablePath,
  NEVER_CRAWLED,
  PUBLIC_PAGES,
  publicPaths,
} from "../features/marketing/pages";
import {
  blogPostingLd,
  breadcrumbLd,
  faqPageLd,
  organizationLd,
  serializeJsonLd,
  webApplicationLd,
  websiteLd,
} from "../features/marketing/seo/json-ld";
import { SENSITIVE_WORDS } from "../lib/discretion";
import { protectedPrefixes } from "../lib/supabase/proxy";

/** SEO and GEO (CLAUDE.md §12, D-114 to D-119). */

const root = join(__dirname, "..", "..");
const AUTH_AND_PRIVATE = [
  ...protectedPrefixes,
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/confirm",
  "/unsubscribe",
  "/account-closing",
  "/breathe",
  "/join",
  "/dev",
  "/api",
  "/progress",
];
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

describe("what may be indexed", () => {
  it("no private, auth or invite path is ever indexable", () => {
    for (const path of indexablePaths()) {
      for (const prefix of AUTH_AND_PRIVATE) expect(under(path, prefix), `${path} under ${prefix}`).toBe(false);
    }
    for (const prefix of AUTH_AND_PRIVATE) expect(isIndexablePath(prefix), prefix).toBe(false);
    expect(isIndexablePath("/join/abc123")).toBe(false);
    expect(isIndexablePath("/groups/123/wall")).toBe(false);
  });

  it("every public page is indexable, with or without a trailing slash", () => {
    for (const page of PUBLIC_PAGES) expect(isIndexablePath(page.path), page.path).toBe(true);
    expect(isIndexablePath("/faq/")).toBe(true);
  });

  it("a draft article is neither public nor indexable; a published one is both (D-120)", () => {
    for (const a of ALL_ARTICLES) {
      const live = a.status === "published";
      expect(publicPaths().includes(articlePath(a.slug)), a.slug).toBe(live);
      expect(isIndexablePath(articlePath(a.slug)), a.slug).toBe(live);
    }
    expect(PUBLIC_PAGES.some((p) => p.path === "/articles")).toBe(ARTICLES.length > 0);
  });

  it("an article can't be published without a reviewer", () => {
    const draft = ALL_ARTICLES[0]!;
    expect(() => checkArticle(articleSchema.parse({ ...draft, status: "published", reviewer: null }))).toThrow(
      /without a reviewer/,
    );
  });

  it("the sitemap lists exactly the indexable pages", () => {
    const urls = sitemap().map((entry) => new URL(entry.url).pathname.replace(/(.)\/$/, "$1"));
    expect(new Set(urls)).toEqual(new Set(indexablePaths()));
  });

  it("robots.txt keeps every crawler, AI crawlers included, out of the app", () => {
    for (const prefix of protectedPrefixes) expect(NEVER_CRAWLED, prefix).toContain(prefix);
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    const agents = list.map((r) => r.userAgent);
    expect(agents).toEqual(["*", ...AI_CRAWLERS]);
    for (const rule of list) {
      expect(rule.disallow).toEqual([...NEVER_CRAWLED]);
      expect(rule.allow).toContain("/");
    }
  });
});

describe("discretion on the public site (D-115)", () => {
  const discreet = (text: string) => !SENSITIVE_WORDS.test(text);

  it("titles and addresses of every public page except articles stay neutral", () => {
    for (const page of PUBLIC_PAGES) expect(discreet(page.path), page.path).toBe(true);
    for (const [key, value] of Object.entries(en.marketing.pages)) {
      expect(discreet(value.title), `marketing.pages.${key}.title`).toBe(true);
    }
    for (const doc of ["privacy", "terms", "yourData", "communityGuidelines", "accessibility", "security"] as const) {
      expect(discreet(en.legal[doc].title), doc).toBe(true);
    }
    for (const plan of Object.values(en.reading.plans)) expect(discreet(plan.title)).toBe(true);
  });

  it("the site's one-line description is neutral and the same in llms.txt", () => {
    expect(discreet(en.marketing.pages.home.description)).toBe(true);
    expect(llmsText()).toContain(en.marketing.pages.home.description);
  });
});

describe("articles, drafts included (§12)", () => {
  for (const article of ALL_ARTICLES) {
    describe(article.slug, () => {
      const file = join(root, "src/content/articles/en", `${article.slug}.mdx`);
      const body = existsSync(file) ? readFileSync(file, "utf8") : "";

      it("has a body", () => {
        expect(body.length).toBeGreaterThan(1500);
      });

      it("opens with a direct answer of two or three sentences", () => {
        const answer = (/^<div className="answer">([\s\S]+?)<\/div>/.exec(body)?.[1] ?? "").trim();
        const sentences = answer.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
        expect(sentences.length).toBeGreaterThanOrEqual(2);
        expect(sentences.length).toBeLessThanOrEqual(3);
      });

      it("uses question-style section headings", () => {
        const h2 = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
        expect(h2.length).toBeGreaterThanOrEqual(4);
        for (const heading of h2) expect(heading.endsWith("?"), heading).toBe(true);
      });

      it("cites Scripture it lists, and links every source it lists", () => {
        for (const ref of article.scripture) {
          const book = ref.replace(/\s\d+:.*$/, "");
          expect(body, ref).toContain(book);
        }
        for (const source of article.sources) expect(body, source.url).toContain(source.url);
      });

      it("never sends readers into the signed-in app", () => {
        expect(body).not.toMatch(/\]\(\/(reading|journal|resources|home|check-in)\b/);
      });
    });
  }
});

describe("structured data (JSON-LD)", () => {
  it("Organization, WebSite and WebApplication carry their required fields", () => {
    const org = organizationLd("d");
    expect(org).toMatchObject({ "@type": "Organization", name: "Holy Auramaxing" });
    expect(String(org.url)).toMatch(/^https?:\/\//);
    expect(String(org.logo)).toMatch(/\/icons\/icon-512\.png$/);
    expect(websiteLd("d")).toMatchObject({ "@type": "WebSite", name: "Holy Auramaxing" });
    expect(webApplicationLd("d")).toMatchObject({ "@type": "WebApplication", applicationCategory: expect.any(String) });
  });

  it("FAQPage has one question per FAQ entry, each with an answer", () => {
    const items = FAQ_KEYS.map((k) => ({ question: en.marketing.faq.items[k].q, answer: en.marketing.faq.items[k].a }));
    const ld = faqPageLd(items) as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
    expect(ld.mainEntity).toHaveLength(FAQ_KEYS.length);
    for (const q of ld.mainEntity) {
      expect(q.name.length).toBeGreaterThan(5);
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(20);
    }
  });

  it("BlogPosting has a headline under 110 characters, an image, dates and an author", () => {
    for (const a of ALL_ARTICLES) {
      const ld = blogPostingLd(a, articlePath(a.slug), `/api/og/${a.slug}`) as Record<string, unknown>;
      expect(String(ld.headline).length).toBeLessThanOrEqual(110);
      expect((ld.image as string[])[0]).toMatch(/^https?:\/\/.+\/api\/og\//);
      expect(ld.datePublished).toBe(a.published);
      expect(ld.dateModified).toBe(a.updated);
      expect((ld.author as Array<{ name: string }>)[0]!.name).toBe(a.author.name);
    }
  });

  it("BreadcrumbList numbers its items from 1 with absolute addresses", () => {
    const ld = breadcrumbLd([
      { name: "Home", path: "/" },
      { name: "FAQ", path: "/faq" },
    ]) as { itemListElement: Array<{ position: number; item: string }> };
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(ld.itemListElement[1]!.item).toMatch(/^https?:\/\/.+\/faq$/);
  });

  it("can't close its own script element", () => {
    const out = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ text: "</script><script>alert(1)</script>" });
  });
});

describe("llms.txt", () => {
  it("names the site and links only public pages", () => {
    const text = llmsText();
    expect(text.startsWith("# Holy Auramaxing\n")).toBe(true);
    const links = [...text.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => new URL(m[1]!).pathname);
    expect(links.length).toBeGreaterThan(5);
    for (const path of links) expect(publicPaths(), path).toContain(path);
    for (const a of ALL_ARTICLES.filter((x) => x.status === "draft")) expect(text).not.toContain(articlePath(a.slug));
  });
});
