import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardTitle } from "@/components/ui/card";
import {
  getPublishedPlanDay,
  getPublishedPlanOutline,
  getPublishedVerseOfDay,
  localDateIn,
  PassageText,
  READING_PLANS,
  VerseOfDayCard,
  type PlanSlug,
} from "@/features/recovery";
import { Link } from "@/i18n/navigation";

import { Breadcrumbs, PageIntro } from "./breadcrumbs";

/**
 * The public Scripture guides (§12 "devotional previews", D-117): today's
 * verse and a preview of each reading plan, read as the anonymous role.
 * Nothing here links into /reading, which needs an account; the call to
 * action is to create one.
 */

async function TrackCard() {
  const t = await getTranslations("marketing.scripture");
  return (
    <Card as="section" aria-labelledby="scripture-track">
      <div className="grid gap-3">
        <CardTitle as="h2" id="scripture-track">
          {t("trackHeading")}
        </CardTitle>
        <p>{t("trackBody")}</p>
        <p>
          <Link href="/sign-up" className={buttonVariants()}>
            {t("track")}
          </Link>
        </p>
      </div>
    </Card>
  );
}

export async function ScriptureHub() {
  const [t, tPlans] = await Promise.all([getTranslations("marketing.scripture"), getTranslations("reading.plans")]);
  // A visitor has no time zone we know of, so "today" is the UTC date.
  const verse = await getPublishedVerseOfDay(localDateIn("UTC")).catch(() => null);
  return (
    <div className="public-content">
      <Breadcrumbs trail={[{ name: t("title"), path: "/scripture" }]} />
      <PageIntro title={t("title")} lede={t("lede")} />
      <div className="stack">
        <VerseOfDayCard verse={verse} />
        <section aria-labelledby="scripture-plans" className="public-section">
          <h2 id="scripture-plans">{t("plansHeading")}</h2>
          <ul className="article-cards">
            {READING_PLANS.map((plan) => (
              <li key={plan.slug} className="article-card">
                <h3 className="article-card__title">
                  <Link href={`/scripture/${plan.slug}`}>{tPlans(`${plan.titleKey}.title`)}</Link>
                </h3>
                <p className="text-muted">{t("days", { count: plan.length })}</p>
                <p>{tPlans(`${plan.titleKey}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>
        <TrackCard />
      </div>
    </div>
  );
}

export async function ScripturePlan({ slug }: { slug: PlanSlug }) {
  const plan = READING_PLANS.find((p) => p.slug === slug)!;
  const [t, tPlans] = await Promise.all([getTranslations("marketing.scripture"), getTranslations("reading.plans")]);
  const title = tPlans(`${plan.titleKey}.title`);
  const [dayOne, outline] = await Promise.all([
    getPublishedPlanDay(slug, 1).catch(() => []),
    getPublishedPlanOutline(slug).catch(() => new Map<number, string[]>()),
  ]);
  return (
    <div className="public-content">
      <Breadcrumbs
        trail={[
          { name: t("title"), path: "/scripture" },
          { name: title, path: `/scripture/${slug}` },
        ]}
      />
      <PageIntro title={title} lede={tPlans(`${plan.titleKey}.body`)} />
      <div className="stack">
        {dayOne.length === 0 && outline.size === 0 ? (
          <p className="auth-banner" role="status">
            {t("unavailable")}
          </p>
        ) : null}
        {dayOne.length > 0 ? (
          <Card as="section" aria-labelledby="scripture-day-one">
            <div className="grid gap-3">
              <CardTitle as="h2" id="scripture-day-one">
                {t("dayOne")}
              </CardTitle>
              <PassageText passages={dayOne} headingLevel="h3" />
            </div>
          </Card>
        ) : null}
        <TrackCard />
        {outline.size > 0 ? (
          <section aria-labelledby="scripture-all-days" className="public-section">
            <h2 id="scripture-all-days">{t("allDays")}</h2>
            <ol className="plan-outline">
              {[...outline.entries()].map(([day, refs]) => (
                <li key={day}>
                  <span className="plan-outline__day">{t("dayLabel", { day })}</span> {refs.join(", ")}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <p>
          <Link href="/scripture" className="text-link">
            {t("back")}
          </Link>
        </p>
      </div>
    </div>
  );
}
