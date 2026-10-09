import {
  CircleCheck,
  Footprints,
  HeartHandshake,
  Sparkles,
  Sunrise,
  Wind,
  BookOpen,
  MessageCircle,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button-variants";
import { ProgressRing } from "@/components/ui/progress-ring";
import { avatarUrl } from "@/features/profile";
import { Link } from "@/i18n/navigation";

import { MOODS, NOTE_MAX, TRIGGERS, URGE_LEVELS } from "../constants";
import type { CheckinErrorKey } from "../errors";
import type { Insight } from "../insights";
import { nextStepFor, type NextStepKey } from "../next-steps";
import { saveReflectionAction, submitCheckinAction } from "../server/actions";
import type { CheckinDetails, CheckinOverview, MemberToday } from "../server/queries";
import { CheckinChoices } from "./checkin-choices";

/**
 * Server components for the check-in pages (CLAUDE.md §7.5). The forms are
 * plain HTML forms posting to Server Actions, so they work without
 * JavaScript; the only client part is the pair of answer buttons.
 */

/** Formats a YYYY-MM-DD date without shifting it through a time zone. */
async function dayFormatter() {
  const format = await getFormatter();
  return (date: string, style: "long" | "short" = "long") =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      timeZone: "UTC",
      ...(style === "long" ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" }),
    });
}

export async function CheckinErrorBanner({ error }: { error: CheckinErrorKey | null }) {
  if (!error) return null;
  const t = await getTranslations("checkins.errors");
  return (
    <p className="auth-banner auth-banner--error" role="alert">
      {t(error)}
    </p>
  );
}

// ---------------------------------------------------------------- the form

export async function CheckinForm({
  date,
  isToday,
  existing,
}: {
  date: string;
  isToday: boolean;
  existing: CheckinDetails | null;
}) {
  const [t, tTrig, day] = await Promise.all([
    getTranslations("checkins.form"),
    getTranslations("checkins.triggers"),
    dayFormatter(),
  ]);
  const hasDetails = Boolean(
    existing && (existing.mood !== null || existing.urge !== null || existing.triggers.length || existing.note),
  );
  const id = (name: string) => `checkin-${date}-${name}`;

  return (
    <form action={submitCheckinAction} className="checkin-form" aria-labelledby={id("question")}>
      <input type="hidden" name="date" value={date} />
      <h2 id={id("question")} className="checkin-question">
        {isToday ? t("questionToday") : t("questionYesterday")}
        <span className="checkin-question__day">
          {isToday ? t("dayToday", { date: day(date) }) : t("dayYesterday", { date: day(date) })}
        </span>
      </h2>

      <details className="checkin-details" open={hasDetails}>
        <summary>{t("detailsSummary")}</summary>
        <div className="checkin-details__body">
          <p className="text-muted">{t("detailsHint")}</p>

          <fieldset className="checkin-scale">
            <legend>{t("moodLegend")}</legend>
            <div className="checkin-scale__options">
              {MOODS.map((m) => (
                <label key={m} className="checkin-pill">
                  <input type="radio" name="mood" value={m} defaultChecked={existing?.mood === m} />
                  <span>{t(`mood.${m}`)}</span>
                </label>
              ))}
              <label className="checkin-pill checkin-pill--quiet">
                <input type="radio" name="mood" value="" defaultChecked={existing?.mood == null} />
                <span>{t("skip")}</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="checkin-scale">
            <legend>{t("urgeLegend")}</legend>
            <div className="checkin-scale__options">
              {URGE_LEVELS.map((u) => (
                <label key={u} className="checkin-pill">
                  <input type="radio" name="urge" value={u} defaultChecked={existing?.urge === u} />
                  <span>{t(`urge.${u}`)}</span>
                </label>
              ))}
              <label className="checkin-pill checkin-pill--quiet">
                <input type="radio" name="urge" value="" defaultChecked={existing?.urge == null} />
                <span>{t("skip")}</span>
              </label>
            </div>
          </fieldset>

          <TriggerChoices legend={t("triggersLegend")} selected={existing?.triggers ?? []} label={(k) => tTrig(k)} />

          <NoteField
            id={id("note")}
            label={t("noteLabel")}
            hint={t("noteHint", { max: NOTE_MAX })}
            defaultValue={existing?.note ?? ""}
          />
        </div>
      </details>

      <p className="checkin-honest">{t("honest")}</p>
      <CheckinChoices
        groupLabel={t("choicesLabel")}
        cleanLabel={isToday ? t("cleanToday") : t("cleanYesterday")}
        slipLabel={t("slipped")}
        savingLabel={t("saving")}
        currentLabel={t("currentAnswer")}
        current={existing?.outcome ?? null}
      />
    </form>
  );
}

function TriggerChoices({
  legend,
  selected,
  label,
}: {
  legend: string;
  selected: readonly string[];
  label: (key: (typeof TRIGGERS)[number]) => string;
}) {
  return (
    <fieldset className="checkin-scale">
      <legend>{legend}</legend>
      <div className="checkin-scale__options">
        {TRIGGERS.map((key) => (
          <label key={key} className="checkin-pill">
            <input type="checkbox" name="triggers" value={key} defaultChecked={selected.includes(key)} />
            <span>{label(key)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NoteField({
  id,
  label,
  hint,
  defaultValue,
}: {
  id: string;
  label: string;
  hint: string;
  defaultValue: string;
}) {
  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-field__label">
        {label}
      </label>
      <p id={`${id}-hint`} className="ui-field__hint">
        {hint}
      </p>
      <textarea
        id={id}
        name="note"
        className="ui-input checkin-note"
        rows={4}
        maxLength={NOTE_MAX}
        defaultValue={defaultValue}
        aria-describedby={`${id}-hint`}
        autoComplete="off"
        spellCheck
      />
    </div>
  );
}

/** "You've checked in for today", with the form folded away to change it. */
export async function AnsweredDay({
  date,
  isToday,
  existing,
  canChangeUntilNoon,
}: {
  date: string;
  isToday: boolean;
  existing: CheckinDetails;
  /** Yesterday: only until 12:00 today. */
  canChangeUntilNoon: boolean;
}) {
  const t = await getTranslations("checkins.form");
  return (
    <section className="ui-card checkin-answered" aria-labelledby={`answered-${date}`}>
      <h2 id={`answered-${date}`} className="ui-card__title">
        {existing.outcome === "clean" ? (
          <CircleCheck aria-hidden="true" className="inline-icon checkin-icon--clean" />
        ) : (
          <Sunrise aria-hidden="true" className="inline-icon checkin-icon--slip" />
        )}{" "}
        {t("answeredTitle", { day: isToday ? t("today") : t("yesterday") })}
      </h2>
      <p>{existing.outcome === "clean" ? t("answeredClean") : t("answeredSlipped")}</p>
      <p className="text-muted">{canChangeUntilNoon ? t("changeUntilNoon") : t("changeUntilToday")}</p>
      <details className="checkin-change">
        <summary>{t("changeSummary")}</summary>
        <CheckinForm date={date} isToday={isToday} existing={existing} />
      </details>
    </section>
  );
}

// ---------------------------------------------------------------- streaks

export async function StreakStats({
  overview,
  headingLevel = "h2",
}: {
  overview: CheckinOverview;
  headingLevel?: "h2" | "h3";
}) {
  const t = await getTranslations("checkins.stats");
  const Heading = headingLevel;
  const target = Math.max(overview.longestStreak, overview.currentStreak, 1);
  return (
    <section className="ui-card streak-stats" aria-labelledby="streak-stats-title">
      <Heading id="streak-stats-title" className="visually-hidden">
        {t("label")}
      </Heading>
      <ProgressRing
        value={overview.currentStreak}
        max={target}
        size="lg"
        label={t("ringLabel")}
        valueText={t("ringValue", { count: overview.currentStreak, longest: overview.longestStreak })}
      >
        <span className="ui-ring__value-text">{overview.currentStreak}</span>
        <span className="ui-ring__caption">{t("ringUnit", { count: overview.currentStreak })}</span>
      </ProgressRing>
      <dl className="streak-stats__list">
        <div>
          <dt>{t("currentStreak")}</dt>
          <dd>{t("days", { count: overview.currentStreak })}</dd>
        </div>
        <div>
          <dt>{t("longestStreak")}</dt>
          <dd>{t("days", { count: overview.longestStreak })}</dd>
        </div>
        <div>
          <dt>{t("totalClean")}</dt>
          <dd>{t("days", { count: overview.totalCleanDays })}</dd>
        </div>
        <div>
          <dt>{t("checkinStreak")}</dt>
          <dd>{t("days", { count: overview.checkinStreak })}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * "Your streak may have reset, but look at everything you kept" (owner's
 * request, D-046): after a slip, and on Home whenever a streak has ended.
 * Shown only when there is something to look back on.
 */
export async function KeptMessage({ overview, reason }: { overview: CheckinOverview; reason: "slip" | "paused" }) {
  if (overview.totalCleanDays === 0) return null;
  const t = await getTranslations("checkins.kept");
  return (
    <section className="kept" aria-labelledby={`kept-${reason}`}>
      <Sparkles aria-hidden="true" className="kept__icon" />
      <h2 id={`kept-${reason}`} className="kept__title">
        {reason === "slip" ? t("slipTitle") : t("pausedTitle")}
      </h2>
      <ul className="kept__list">
        <li>
          <strong>{t("cleanDays", { count: overview.totalCleanDays })}</strong>
        </li>
        <li>
          <strong>{t("streaks", { count: overview.cleanStreaks })}</strong>
        </li>
        <li>
          <strong>{t("longest", { count: overview.longestStreak })}</strong>
        </li>
      </ul>
      <p>{t("body")}</p>
    </section>
  );
}

// ---------------------------------------------------------------- home

export async function TodayCard({ overview }: { overview: CheckinOverview }) {
  const t = await getTranslations("checkins.today");
  const today = overview.answered[overview.today];
  const yesterday = overview.openDates[1];
  const yesterdayOpen = Boolean(yesterday && !overview.answered[yesterday]);
  return (
    <section className="ui-card today-card" aria-labelledby="today-card-title">
      <h2 id="today-card-title" className="ui-card__title">
        {t("title")}
      </h2>
      {today ? (
        <p className="today-card__status">
          {today === "clean" ? (
            <CircleCheck aria-hidden="true" className="inline-icon checkin-icon--clean" />
          ) : (
            <Sunrise aria-hidden="true" className="inline-icon checkin-icon--slip" />
          )}{" "}
          {today === "clean" ? t("doneClean") : t("doneSlipped")}
        </p>
      ) : (
        <p className="today-card__status">{t("notYet")}</p>
      )}
      <div className="profile-actions">
        {today ? (
          <Link href="/check-in" className={buttonVariants({ variant: "secondary" })}>
            {t("change")}
          </Link>
        ) : (
          <Link href="/check-in" className={buttonVariants({ variant: "primary", size: "lg" })}>
            {t("cta")}
          </Link>
        )}
        <Link href="/progress" className={buttonVariants({ variant: "ghost" })}>
          {t("progressLink")}
        </Link>
      </div>
      {yesterdayOpen ? (
        <p className="text-muted">
          {t("yesterdayOpen")}{" "}
          <Link href={`/check-in?date=${yesterday}`} className="text-link">
            {t("yesterdayLink")}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- the slip page

const NEXT_ICONS: Record<NextStepKey, ReactNode> = {
  breathe: <Wind aria-hidden="true" />,
  walk: <Footprints aria-hidden="true" />,
  verse: <BookOpen aria-hidden="true" />,
  message: <MessageCircle aria-hidden="true" />,
};

export async function NextStep({ date }: { date: string }) {
  const t = await getTranslations("checkins.mercies");
  const step = nextStepFor(date);
  return (
    <section className="ui-card next-step" aria-labelledby="next-step-title">
      <h2 id="next-step-title" className="ui-card__title">
        {t("nextTitle")}
      </h2>
      <div className="next-step__body">
        <span className="next-step__icon">{NEXT_ICONS[step]}</span>
        <div>
          <h3 className="next-step__title">{t(`next.${step}.title`)}</h3>
          <p>{t(`next.${step}.body`)}</p>
        </div>
      </div>
    </section>
  );
}

export async function PrayerCard() {
  const t = await getTranslations("checkins.mercies");
  return (
    <section className="ui-card" aria-labelledby="prayer-title">
      <h2 id="prayer-title" className="ui-card__title">
        <HeartHandshake aria-hidden="true" className="inline-icon" /> {t("prayerTitle")}
      </h2>
      <p>{t("prayerBody")}</p>
      <div>
        <Link href="/groups" className={buttonVariants({ variant: "secondary" })}>
          {t("prayerGroups")}
        </Link>
      </div>
    </section>
  );
}

export async function ReflectionForm({ existing, saved }: { existing: CheckinDetails; saved: boolean }) {
  const [t, tForm, tTrig] = await Promise.all([
    getTranslations("checkins.mercies"),
    getTranslations("checkins.form"),
    getTranslations("checkins.triggers"),
  ]);
  return (
    <section className="ui-card" aria-labelledby="reflection" id="reflection-section">
      <h2 id="reflection" className="ui-card__title" tabIndex={-1}>
        {t("reflectionTitle")}
      </h2>
      <p className="text-muted">{t("reflectionLede")}</p>
      {/* Always in the page, so saving (which reloads this same page) is announced (WCAG 4.1.3). */}
      <p className="group-status" role="status">
        {saved ? t("reflectionSaved") : null}
      </p>
      <form action={saveReflectionAction} className="stack-sm">
        <input type="hidden" name="date" value={existing.date} />
        <TriggerChoices legend={tForm("triggersLegend")} selected={existing.triggers} label={(k) => tTrig(k)} />
        <NoteField
          id="reflection-note"
          label={t("reflectionNoteLabel")}
          hint={tForm("noteHint", { max: NOTE_MAX })}
          defaultValue={existing.note ?? ""}
        />
        <div>
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            {t("reflectionSave")}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- insights

export async function InsightList({ insights }: { insights: Insight[] }) {
  const [t, tTrig, format] = await Promise.all([
    getTranslations("checkins.insights"),
    getTranslations("checkins.triggers"),
    getFormatter(),
  ]);
  const weekdayName = (weekday: number) =>
    // 2023-01-01 was a Sunday.
    format.dateTime(new Date(Date.UTC(2023, 0, 1 + weekday)), { weekday: "long", timeZone: "UTC" });
  const text = (insight: Insight): string => {
    switch (insight.key) {
      case "notEnough":
        return t("notEnough", insight.values);
      case "freeDays":
        return t("freeDays", insight.values);
      case "topTriggers":
        return insight.values.second
          ? t("topTriggersTwo", { first: tTrig(insight.values.first), second: tTrig(insight.values.second) })
          : t("topTriggersOne", { first: tTrig(insight.values.first) });
      case "urgesOnDay":
        return t("urgesOnDay", { weekday: weekdayName(insight.values.weekday) });
      case "hardDayTrigger":
        return t("hardDayTrigger", { trigger: tTrig(insight.values.trigger) });
      default:
        return t(insight.key);
    }
  };
  return (
    <ul className="insight-list">
      {insights.map((insight) => (
        <li key={insight.key}>{text(insight)}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- a group's today

export async function GroupToday({ members }: { members: MemberToday[] }) {
  const t = await getTranslations("checkins.group");
  const done = members.filter((m) => m.checkedInToday).length;
  return (
    <section className="ui-card group-today" aria-labelledby="home-today">
      <h2 id="home-today" className="ui-card__title">
        {t("title")}
      </h2>
      {members.length ? (
        <>
          <p className="group-today__summary">{t("summary", { done, total: members.length })}</p>
          <ul className="group-today__list">
            {members.map((m) => {
              const name = m.isMe ? t("you") : m.name || t("someone");
              return (
                <li key={m.userId} className="group-today__row">
                  <Avatar
                    name={m.name || t("someone")}
                    size="sm"
                    decorative
                    src={avatarUrl(m.userId, m.avatarPath, "sm")}
                  />
                  <span className="group-today__name">{name}</span>
                  <span className="group-today__facts">
                    <span className={m.checkedInToday ? "today-chip today-chip--done" : "today-chip"}>
                      {m.checkedInToday ? <CircleCheck aria-hidden="true" className="inline-icon" /> : null}
                      {m.checkedInToday ? t("checkedIn") : t("notYet")}
                    </span>
                    {m.currentStreak !== null && m.currentStreak > 0 ? (
                      <span className="today-chip">{t("streak", { count: m.currentStreak })}</span>
                    ) : null}
                    {m.outcome ? (
                      <span className={`today-chip today-chip--${m.outcome}`}>
                        {m.outcome === "clean" ? t("clean") : t("slipped")}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-muted group-today__note">{t("shareNote")}</p>
        </>
      ) : (
        <p className="text-muted">{t("empty")}</p>
      )}
    </section>
  );
}
