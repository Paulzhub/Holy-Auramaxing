import { BookOpen, Check, CircleAlert, Info } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Flash } from "@/lib/server/flash";

import type { Passage, PlanSlug } from "../reading";
import { markReadAction, startPlanAction, unmarkReadAction } from "../server/reading-actions";
import type { PlanProgress, VerseOfDay } from "../server/reading";

/**
 * Daily reading (CLAUDE.md §7.9, D-112). Server components and plain forms
 * that work without JavaScript. Grace: a plan has no dates, so nothing here
 * can say "behind" or "missed"; the only nudge is the next unread day.
 */

const notices = new Set(["planStarted", "dayRead", "dayUnread"]);
const errors = new Set(["readingFailed", "rateLimited"]);

/** The one-minute note after a form (D-098), focused on arrival (D-103). */
export async function ReadingNotice({ flash }: { flash: Flash }) {
  const t = await getTranslations("reading.notices");
  if (flash.error && errors.has(flash.error)) {
    return (
      <p className="auth-banner auth-banner--error" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{t(flash.error as "readingFailed")}</span>
      </p>
    );
  }
  if (flash.saved && notices.has(flash.saved)) {
    return (
      <p className="auth-banner" role="status">
        <Info aria-hidden="true" />
        <span>{t(flash.saved as "dayRead")}</span>
      </p>
    );
  }
  return null;
}

export async function VerseOfDayCard({ verse }: { verse: VerseOfDay | null }) {
  const t = await getTranslations("reading.verse");
  if (!verse) return null;
  return (
    <Card as="section" aria-labelledby="verse-of-day-title">
      <CardTitle as="h2" id="verse-of-day-title">
        {t("heading")}
      </CardTitle>
      <figure className="verse reading-verse">
        <blockquote>
          <p>{verse.text}</p>
        </blockquote>
        <figcaption>{t("reference", { reference: verse.reference })}</figcaption>
      </figure>
    </Card>
  );
}

/** The chapters of one plan day, verse by verse. */
export async function PassageText({ passages, headingLevel }: { passages: Passage[]; headingLevel: "h3" | "h4" }) {
  const t = await getTranslations("reading");
  const H = headingLevel;
  return (
    <div className="reading-text">
      {passages.map((p) => (
        <section key={p.ref} aria-label={p.ref}>
          <H className="reading-text__ref">{p.ref}</H>
          <p>
            {p.verses.map(([n, text]) => (
              <span key={n} className="reading-text__verse">
                <sup className="reading-text__num">{n}</sup>
                {text}{" "}
              </span>
            ))}
          </p>
        </section>
      ))}
      <p className="text-muted reading-text__source">{t("source")}</p>
    </div>
  );
}

function Hidden({ plan, day, back }: { plan: PlanSlug; day: number; back: "reading" | "plan" }) {
  return (
    <>
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="back" value={back} />
    </>
  );
}

/** "Mark day N as read" / "Mark as not read" for one plan day. */
export async function MarkDayForm({
  plan,
  day,
  isRead,
  back,
}: {
  plan: PlanSlug;
  day: number;
  isRead: boolean;
  back: "reading" | "plan";
}) {
  const t = await getTranslations("reading");
  if (isRead) {
    return (
      <form action={unmarkReadAction} className="reading-mark">
        <Hidden plan={plan} day={day} back={back} />
        <p className="reading-mark__done">
          <Check aria-hidden="true" />
          <span>{t("plan.isRead")}</span>
        </p>
        <button type="submit" className={buttonVariants({ variant: "ghost" })}>
          {t("plan.unmark")}
        </button>
      </form>
    );
  }
  return (
    <form action={markReadAction} className="reading-mark">
      <Hidden plan={plan} day={day} back={back} />
      <button type="submit" className={buttonVariants({ variant: "primary" })}>
        {t("current.markRead", { day })}
      </button>
    </form>
  );
}

/** The plan someone is reading now, with today's passage. */
export async function CurrentPlanCard({ plan, passages }: { plan: PlanProgress; passages: Passage[] }) {
  const t = await getTranslations("reading");
  return (
    <Card as="section" aria-labelledby="current-plan-title">
      <p className="text-muted">{t("current.heading")}</p>
      <CardTitle as="h2" id="current-plan-title">
        {t(`plans.${plan.titleKey}.title`)}
      </CardTitle>
      <p>{t("current.readCount", { count: plan.read.size, length: plan.length })}</p>
      {plan.next ? (
        <>
          <p className="reading-day-label">{t("current.dayOf", { day: plan.next, length: plan.length })}</p>
          <PassageText passages={passages} headingLevel="h3" />
          <MarkDayForm plan={plan.slug} day={plan.next} isRead={false} back="reading" />
        </>
      ) : (
        <>
          <p className="reading-day-label">{t("current.finished")}</p>
          <p className="text-muted">{t("current.finishedBody")}</p>
        </>
      )}
      <p>
        <Link href={`/reading/${plan.slug}`} className="text-link">
          {t("current.seeAll")}
        </Link>
      </p>
    </Card>
  );
}

/** Start one of the plans, or pick up another one already begun. */
export async function PlanChoices({ plans, activeSlug }: { plans: PlanProgress[]; activeSlug: PlanSlug | null }) {
  const t = await getTranslations("reading");
  const others = plans.filter((p) => p.slug !== activeSlug);
  return (
    <section aria-labelledby="plan-choices-title" className="stack">
      <h2 id="plan-choices-title" className="reading-section-title">
        {activeSlug ? t("choices.otherHeading") : t("choices.heading")}
      </h2>
      {activeSlug ? null : <p className="text-muted">{t("choices.body")}</p>}
      <ul className="reading-plans">
        {others.map((p) => (
          <li key={p.slug}>
            <Card as="article" aria-labelledby={`plan-${p.slug}`}>
              <div className="reading-plan__head">
                <BookOpen aria-hidden="true" className="h-6 w-6 flex-none" />
                <CardTitle as="h3" id={`plan-${p.slug}`}>
                  {t(`plans.${p.titleKey}.title`)}
                </CardTitle>
              </div>
              <p className="text-muted">{t(`plans.${p.titleKey}.body`)}</p>
              {p.read.size > 0 ? (
                <p>
                  {p.next
                    ? t("choices.pickUp", { day: p.next })
                    : t("current.readCount", { count: p.read.size, length: p.length })}
                </p>
              ) : null}
              <form action={startPlanAction} className="reading-plan__actions">
                <input type="hidden" name="plan" value={p.slug} />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "secondary" })}
                  aria-label={t(p.read.size > 0 ? "choices.continueNamed" : "choices.startNamed", {
                    title: t(`plans.${p.titleKey}.title`),
                  })}
                >
                  {p.read.size > 0 ? t("choices.continue") : t("choices.start")}
                </button>
                <Link
                  href={`/reading/${p.slug}`}
                  className="text-link"
                  aria-label={t("choices.seeDaysNamed", { title: t(`plans.${p.titleKey}.title`) })}
                >
                  {t("choices.seeDays")}
                </Link>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A plan's page: every day, and the chosen day's passage. */
export async function PlanDaysView({
  plan,
  outline,
  day,
  passages,
}: {
  plan: PlanProgress & { isActive: boolean };
  outline: Map<number, string[]>;
  day: number;
  passages: Passage[];
}) {
  const t = await getTranslations("reading");
  return (
    <div className="stack">
      <p>{t("current.readCount", { count: plan.read.size, length: plan.length })}</p>
      {plan.isActive ? null : (
        <form action={startPlanAction}>
          <input type="hidden" name="plan" value={plan.slug} />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="back" value="plan" />
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            {plan.read.size > 0 ? t("choices.continue") : t("choices.start")}
          </button>
        </form>
      )}

      <Card as="section" aria-labelledby="plan-day-title">
        <CardTitle as="h2" id="plan-day-title">
          {t("plan.dayHeading", { day })}
        </CardTitle>
        <PassageText passages={passages} headingLevel="h3" />
        <MarkDayForm plan={plan.slug} day={day} isRead={plan.read.has(day)} back="plan" />
      </Card>

      <nav aria-labelledby="plan-days-title">
        <h2 id="plan-days-title" className="reading-section-title">
          {t("plan.days")}
        </h2>
        <ol className="reading-days">
          {[...outline.entries()].map(([n, refs]) => (
            <li key={n}>
              <Link
                href={`/reading/${plan.slug}?day=${n}`}
                className="reading-days__link"
                aria-current={n === day ? "page" : undefined}
              >
                <span className="reading-days__day">{t("plan.dayLink", { day: n })}</span>
                <span className="reading-days__refs">{refs.join(", ")}</span>
                {plan.read.has(n) ? (
                  <span className="reading-days__read">
                    <Check aria-hidden="true" className="h-4 w-4" />
                    <span>{t("plan.dayRead")}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <p>
        <Link href="/reading" className="text-link">
          {t("plan.back")}
        </Link>
      </p>
    </div>
  );
}
