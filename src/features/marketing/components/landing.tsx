import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { Link } from "@/i18n/navigation";

import { ARTICLES } from "../articles";
import { FAQ_PREVIEW } from "../faq";
import { articlePath } from "../pages";
import { organizationLd, webApplicationLd, websiteLd } from "../seo/json-ld";
import { JsonLd } from "./json-ld";
import { StoryEnhancer } from "../story/story-enhancer";
import { StoryArt } from "./story-art";

/**
 * The landing page: the scroll story "From chains to freedom" (CLAUDE.md §8,
 * storyboard D-118), then how it works, privacy, questions and reading.
 *
 * This is the version everyone gets first and the one crawlers, readers
 * without JavaScript and reduced-motion visitors keep: real HTML in six
 * scenes, each with a still picture. `StoryEnhancer` (Phase 9b, D-121)
 * enhances `[data-story]` after the page has painted, without changing a
 * word: the three.js scene, the pinned scenes 2–5 (`[data-story-pin]`, a
 * plain wrapper with `display: contents` until then), SplitText and Lenis.
 */
export async function Landing() {
  const t = await getTranslations("marketing");
  const description = t("pages.home.description");

  return (
    <>
      <JsonLd data={[organizationLd(description), websiteLd(description), webApplicationLd(description)]} />
      <div className="story" data-story>
        <section className="story-scene story-scene--hero" data-scene="hero" aria-labelledby="story-hero-title">
          <div className="story-scene__inner">
            <p className="story-eyebrow">{t("home.hero.eyebrow")}</p>
            <h1 id="story-hero-title" className="story-hero__title">
              {t("home.hero.title")}
            </h1>
            <p className="story-hero__lede">{t("home.hero.lede")}</p>
            <div className="story-actions">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                {t("home.hero.cta")}
              </Link>
              <Link href="/how-it-works" className={buttonVariants({ size: "lg", variant: "secondary" })}>
                {t("home.hero.secondary")}
              </Link>
            </div>
          </div>
          <StoryArt variant="whole" className="story-art--band" />
        </section>

        <div className="story-pin" data-story-pin>
          <section className="story-scene story-scene--weight" data-scene="weight" aria-labelledby="story-weight-title">
            <div className="story-scene__inner story-scene__inner--centre">
              <h2 id="story-weight-title">{t("home.weight.title")}</h2>
              <p>{t("home.weight.body")}</p>
            </div>
            <StoryArt variant="heavy" className="story-art--band" />
          </section>

          <section className="story-scene story-scene--crack" data-scene="crack" aria-labelledby="story-crack-title">
            <div className="story-scene__inner story-scene__inner--centre">
              <StoryArt variant="cracked" />
              <h2 id="story-crack-title">{t("home.crack.title")}</h2>
              <figure className="story-verse">
                <blockquote>
                  <p>{t("quoted", { text: t("home.crack.verse") })}</p>
                </blockquote>
                <figcaption>{t("home.crack.reference")}</figcaption>
              </figure>
            </div>
          </section>

          <section className="story-scene story-scene--check" data-scene="check" aria-labelledby="story-check-title">
            <div className="story-scene__inner">
              <StoryArt variant="broken" />
              <h2 id="story-check-title">{t("home.checkIn.title")}</h2>
              <p>{t("home.checkIn.body")}</p>
              <ul className="story-answers" aria-label={t("home.checkIn.example")}>
                <li className="story-answers__free">{t("home.checkIn.free")}</li>
                <li className="story-answers__slipped">{t("home.checkIn.slipped")}</li>
              </ul>
              <p className="story-grace">{t("home.checkIn.grace")}</p>
            </div>
          </section>

          <section
            className="story-scene story-scene--together"
            data-scene="together"
            aria-labelledby="story-together-title"
          >
            <div className="story-scene__inner story-scene__inner--centre">
              <StoryArt variant="light" />
              <h2 id="story-together-title">{t("home.together.title")}</h2>
              <p>{t("home.together.body")}</p>
              <ul className="story-chips">
                <li>{t("home.together.groups")}</li>
                <li>{t("home.together.partners")}</li>
                <li>{t("home.together.prayer")}</li>
              </ul>
            </div>
          </section>
        </div>

        <section className="story-scene story-scene--dawn" data-scene="dawn" aria-labelledby="story-dawn-verse">
          <div className="story-scene__inner story-scene__inner--centre">
            <StoryArt variant="dawn" />
            <figure className="story-verse story-verse--large">
              <blockquote id="story-dawn-verse">
                <p>{t("quoted", { text: t("home.dawn.verse") })}</p>
              </blockquote>
              <figcaption>{t("home.dawn.reference")}</figcaption>
            </figure>
            <div className="story-actions">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                {t("home.dawn.cta")}
              </Link>
              <Link href="/how-it-works" className={buttonVariants({ size: "lg", variant: "secondary" })}>
                {t("home.dawn.secondary")}
              </Link>
            </div>
            <p className="story-small">{t("home.dawn.small")}</p>
          </div>
        </section>
      </div>
      <StoryEnhancer />

      <div className="public-content">
        <section className="public-section" aria-labelledby="home-privacy-title">
          <h2 id="home-privacy-title">{t("home.privacy.title")}</h2>
          <p>{t("home.privacy.body")}</p>
          <p>
            <Link href="/your-data" className="text-link">
              {t("home.privacy.link")}
            </Link>
          </p>
        </section>

        <section className="public-section" aria-labelledby="home-questions-title">
          <h2 id="home-questions-title">{t("home.questions.title")}</h2>
          <dl className="faq-list">
            {FAQ_PREVIEW.map((key) => (
              <div key={key} className="faq-list__item">
                <dt>{t(`faq.items.${key}.q`)}</dt>
                <dd>{t(`faq.items.${key}.a`)}</dd>
              </div>
            ))}
          </dl>
          <p>
            <Link href="/faq" className="text-link">
              {t("home.questions.more")}
            </Link>
          </p>
        </section>

        <section className="public-section" aria-labelledby="home-reading-title">
          <h2 id="home-reading-title">{t("home.reading.title")}</h2>
          {ARTICLES.length > 0 ? (
            <ul className="article-cards">
              {ARTICLES.map((a) => (
                <li key={a.slug} className="article-card">
                  <h3 className="article-card__title">
                    <Link href={articlePath(a.slug)}>{a.title}</Link>
                  </h3>
                  <p>{a.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("scripture.lede")}</p>
          )}
          <p className="flex flex-wrap gap-x-5 gap-y-2">
            {ARTICLES.length > 0 ? (
              <Link href="/articles" className="text-link">
                {t("home.reading.more")}
              </Link>
            ) : null}
            <Link href="/scripture" className="text-link">
              {t("home.reading.scripture")}
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
