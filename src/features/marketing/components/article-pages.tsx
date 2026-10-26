import { FileWarning } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";

import { ARTICLES, type Article } from "../articles";
import { articlePath } from "../pages";
import { blogPostingLd } from "../seo/json-ld";
import { ogImagePath } from "../seo/metadata";
import { Breadcrumbs, PageIntro } from "./breadcrumbs";
import { JsonLd } from "./json-ld";

export async function ArticlesHub() {
  const t = await getTranslations("marketing.articles");
  const format = await getFormatter();
  return (
    <div className="public-content">
      <Breadcrumbs trail={[{ name: t("title"), path: "/articles" }]} />
      <PageIntro title={t("title")} lede={t("lede")} />
      <ul className="article-cards">
        {ARTICLES.map((a) => (
          <li key={a.slug} className="article-card">
            <h2 className="article-card__title">
              <Link href={articlePath(a.slug)}>{a.title}</Link>
            </h2>
            <p>{a.description}</p>
            <p className="text-muted">
              {t("updated", {
                date: format.dateTime(new Date(`${a.updated}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" }),
              })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One article (§12): answer first, question-style headings, Scripture and
 * sources, author and reviewer bios, and the updated date. `children` is the
 * compiled MDX body.
 */
export async function ArticleView({ article, children }: { article: Article; children: ReactNode }) {
  const t = await getTranslations("marketing.articles");
  const format = await getFormatter();
  const path = articlePath(article.slug);
  const date = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" });

  return (
    <div className="public-content">
      <JsonLd data={blogPostingLd(article, path, ogImagePath(article.slug))} />
      <Breadcrumbs
        trail={[
          { name: t("title"), path: "/articles" },
          { name: article.title, path },
        ]}
      />
      <article className="article" aria-labelledby="article-title">
        <header className="article__header">
          <h1 id="article-title" className="page-title">
            {article.title}
          </h1>
          <p className="article__byline">
            {t("by", { name: article.author.name })}
            {" · "}
            <time dateTime={article.updated}>{t("updated", { date: date(article.updated) })}</time>
          </p>
          {article.reviewer ? (
            <p className="article__byline">{t("reviewedBy", article.reviewer)}</p>
          ) : (
            <div className="legal__draft" role="note">
              <FileWarning aria-hidden="true" />
              <p>{t.rich("reviewPendingNote", { b: (chunks) => <strong>{chunks}</strong> })}</p>
            </div>
          )}
        </header>

        <div className="article-body">{children}</div>

        <section aria-labelledby="article-scripture" className="article__refs">
          <h2 id="article-scripture">{t("scriptureHeading")}</h2>
          <ul>
            {article.scripture.map((ref) => (
              <li key={ref}>{ref}</li>
            ))}
          </ul>
        </section>

        {article.sources.length > 0 ? (
          <section aria-labelledby="article-sources" className="article__refs">
            <h2 id="article-sources">{t("sourcesHeading")}</h2>
            <ol>
              {article.sources.map((s) => (
                <li key={s.url}>
                  {t.rich("source", {
                    title: s.title,
                    publisher: s.publisher,
                    a: (chunks) => (
                      <a className="text-link" href={s.url} rel="noopener noreferrer">
                        {chunks}
                      </a>
                    ),
                  })}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section aria-labelledby="article-help" className="article__help">
          <h2 id="article-help">{t("helpHeading")}</h2>
          <p>{t("helpBody")}</p>
          <p className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/get-help" className="text-link">
              {t("helpLink")}
            </Link>
            <Link href="/sign-up" className="text-link">
              {t("startLink")}
            </Link>
          </p>
        </section>

        <aside aria-labelledby="article-author" className="article__person">
          <h2 id="article-author">{t("authorHeading")}</h2>
          <p>{t.rich("person", { ...article.author, b: (chunks) => <strong>{chunks}</strong> })}</p>
        </aside>
        {article.reviewer ? (
          <aside aria-labelledby="article-reviewer" className="article__person">
            <h2 id="article-reviewer">{t("reviewerHeading")}</h2>
            <p>{t.rich("person", { ...article.reviewer, b: (chunks) => <strong>{chunks}</strong> })}</p>
          </aside>
        ) : null}
      </article>
    </div>
  );
}
