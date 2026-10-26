import en from "../../../../../messages/en.json";
import { ARTICLES, articleBySlug, ogImage } from "@/features/marketing";

/**
 * Card pictures for Open Graph and Twitter (CLAUDE.md §12): "site" for every
 * public page (neutral, D-115), and one per article (its title). Built once
 * at build time. Under /api so the address is stable and never redirected
 * by the locale routing.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ name: "site" }, ...ARTICLES.map((a) => ({ name: a.slug }))];
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const article = articleBySlug(name);
  if (article) return ogImage({ title: article.title, kicker: en.marketing.nav.articles });
  return ogImage({ title: en.marketing.home.hero.title, kicker: en.marketing.home.hero.eyebrow });
}
