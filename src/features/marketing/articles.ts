/**
 * The articles hub (CLAUDE.md §12, D-116). Each article's body is an MDX
 * file at src/content/articles/<locale>/<slug>.mdx; its metadata lives here,
 * as plain data, so the sitemap, the proxy, llms.txt and the tests can read
 * it without compiling MDX.
 *
 * Discretion (owner, 2026-10-26, D-115): articles are the only public pages
 * whose title, description and address may name the topic, because that's
 * what someone searching for help types. Every other public title and
 * address stays neutral.
 */
import { z } from "zod";

const personSchema = z.object({
  name: z.string().min(2),
  role: z.string().min(2),
  bio: z.string().min(20).max(400),
});

const sourceSchema = z.object({
  title: z.string().min(3),
  publisher: z.string().min(2),
  url: z.url().startsWith("https://"),
});

export const articleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** The question the article answers; also its <title> and H1. */
  title: z.string().min(10).max(70),
  description: z.string().min(50).max(160),
  /** ISO dates. */
  published: z.iso.date(),
  updated: z.iso.date(),
  author: personSchema,
  /** A pastor or counsellor. Until one is named, the article is noindex. */
  reviewer: personSchema.nullable(),
  /** Scripture cited (World English Bible), for the reference list and JSON-LD. */
  scripture: z.array(z.string().min(3)).min(1),
  sources: z.array(sourceSchema),
});

export type Article = z.infer<typeof articleSchema>;

export const FOUNDER = {
  name: "Paulz",
  role: "Founder of Holy Auramaxing",
  bio: "Paulz started Holy Auramaxing so a few friends could walk towards freedom together, with grace and Scripture at the centre.",
} as const;

const data: Article[] = [
  {
    slug: "how-to-quit-porn-as-a-christian",
    title: "How do I quit porn as a Christian?",
    description:
      "Start with grace, not shame: confess to God and one trusted person, guard your weak moments, and take freedom one honest day at a time.",
    published: "2026-10-26",
    updated: "2026-10-26",
    author: FOUNDER,
    reviewer: null,
    scripture: [
      "Romans 8:1",
      "1 John 1:9",
      "James 5:16",
      "1 Corinthians 10:13",
      "Philippians 4:8",
      "Lamentations 3:22–23",
    ],
    sources: [
      {
        title: "Religious, moral beliefs may exacerbate concerns about porn addiction",
        publisher: "American Psychological Association, 2020",
        url: "https://www.apa.org/news/press/releases/2020/02/religious-moral-porn-addiction",
      },
      {
        title: "Surfing the urge: brief mindfulness-based intervention for college student smokers",
        publisher: "Bowen and Marlatt, Psychology of Addictive Behaviors, 2009",
        url: "https://pubmed.ncbi.nlm.nih.gov/20025372/",
      },
      {
        title: "Evaluation and treatment of compulsive sexual behavior: current limitations and potential strategies",
        publisher: "Zhu and colleagues, Frontiers in Psychiatry, 2025",
        url: "https://www.frontiersin.org/articles/10.3389/fpsyt.2025.1621136/full",
      },
    ],
  },
  {
    slug: "what-does-the-bible-say-about-lust",
    title: "What does the Bible say about lust?",
    description:
      "The Bible calls lust a desire that treats a person as an object, and Jesus takes it seriously. It also offers full forgiveness and a new way to live.",
    published: "2026-10-26",
    updated: "2026-10-26",
    author: FOUNDER,
    reviewer: null,
    scripture: [
      "Matthew 5:27–29",
      "Genesis 1:27, 31",
      "1 Corinthians 6:11, 19–20",
      "1 Thessalonians 4:4–5",
      "Hebrews 4:15–16",
      "James 1:14–15",
      "Titus 2:11–12",
      "Galatians 5:16",
      "Romans 12:2",
      "Philippians 4:8",
      "1 John 1:9",
      "Psalm 51:10",
    ],
    sources: [
      {
        title: "Evaluation and treatment of compulsive sexual behavior: current limitations and potential strategies",
        publisher: "Zhu and colleagues, Frontiers in Psychiatry, 2025",
        url: "https://www.frontiersin.org/articles/10.3389/fpsyt.2025.1621136/full",
      },
    ],
  },
  {
    slug: "how-to-help-a-friend-who-is-struggling",
    title: "How do I help a friend who is struggling with porn?",
    description:
      "Listen without shock, keep their trust, pray with them, and walk alongside them for the long haul. Know when to point them to a pastor or counsellor.",
    published: "2026-10-26",
    updated: "2026-10-26",
    author: FOUNDER,
    reviewer: null,
    scripture: ["Galatians 6:1–2", "Ecclesiastes 4:9–10", "Proverbs 17:17", "Proverbs 27:17", "Lamentations 3:23"],
    sources: [
      {
        title: "Evaluation and treatment of compulsive sexual behavior: current limitations and potential strategies",
        publisher: "Zhu and colleagues, Frontiers in Psychiatry, 2025",
        url: "https://www.frontiersin.org/articles/10.3389/fpsyt.2025.1621136/full",
      },
      {
        title: "Religious, moral beliefs may exacerbate concerns about porn addiction",
        publisher: "American Psychological Association, 2020",
        url: "https://www.apa.org/news/press/releases/2020/02/religious-moral-porn-addiction",
      },
    ],
  },
];

export const ARTICLES: readonly Article[] = data.map((a) => articleSchema.parse(a));

export function articleBySlug(slug: string): Article | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}
