import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { articleBySlug, ArticleView, articlePath, publicMetadata } from "@/features/marketing";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const article = articleBySlug((await params).slug);
  if (!article) return {};
  return publicMetadata({
    title: article.title,
    description: article.description,
    path: articlePath(article.slug),
    type: "article",
    image: article.slug,
    published: article.published,
    modified: article.updated,
  });
}

/** An article (§12, D-116); its body is src/content/articles/<locale>/<slug>.mdx. */
export default async function Page({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();
  const { default: Body } = (await import(`@/content/articles/${locale}/${slug}.mdx`)) as {
    default: () => React.ReactNode;
  };
  return (
    <ArticleView article={article}>
      <Body />
    </ArticleView>
  );
}
