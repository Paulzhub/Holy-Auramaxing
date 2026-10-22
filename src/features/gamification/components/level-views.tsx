import { Mountain, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { ProgressRing } from "@/components/ui/progress-ring";

import type { LevelChange } from "../level-change";
import { canShareLevel } from "../share-card";
import type { LevelOverview } from "../server/queries";

/**
 * Level pages (CLAUDE.md §7.6). Server components: no JavaScript reaches the
 * browser. The celebration is CSS only and turns off under reduced motion
 * (§8); nothing here is ever shown to anyone else.
 */

/** The level card: name, era, verse and "3 of 10 days to …". */
export async function LevelCard({
  level,
  headingLevel = "h2",
  sharePreview = false,
  children,
}: {
  level: LevelOverview;
  headingLevel?: "h2" | "h3";
  /** Show a small picture of the share card above its link (Progress only, D-073). */
  sharePreview?: boolean;
  /** Extra lines under the progress (Home puts the XP total here). */
  children?: ReactNode;
}) {
  const t = await getTranslations("levels");
  const Heading = headingLevel;
  const dropped = level.missedSinceLast > 0 && level.level < level.storedLevel;
  return (
    // Named "Your level, Clay", not just "Clay", in a list of regions (A2-9, WCAG 2.4.6).
    <section className="ui-card level-card" aria-labelledby="level-card-kicker level-card-title">
      <div className="level-card__top">
        <ProgressRing
          value={level.progressDays}
          max={level.daysToNext}
          size="md"
          label={t("progressLabel")}
          valueText={t("progress", { done: level.progressDays, total: level.daysToNext, next: level.nextLabel })}
        >
          <span className="ui-ring__value-text">{level.level}</span>
          <span className="ui-ring__caption">{t("levelWord")}</span>
        </ProgressRing>
        <div className="level-card__name">
          <p className="level-card__kicker" id="level-card-kicker">
            {t("title")}
          </p>
          <Heading id="level-card-title" className="level-card__label">
            {level.label}
          </Heading>
          <p className="level-card__era">{t("levelAndEra", { level: level.level, era: level.era })}</p>
        </div>
      </div>
      <p className="level-card__progress">
        {t("progress", { done: level.progressDays, total: level.daysToNext, next: level.nextLabel })}
      </p>
      {children}
      {dropped ? <p className="level-card__quiet">{t("down", { label: level.label })}</p> : null}
      {level.level === 0 && !dropped ? <p className="level-card__quiet">{t("clay")}</p> : null}
      <figure className="verse level-card__verse">
        <blockquote>
          <p>{level.verseText}</p>
        </blockquote>
        <figcaption>{t("verseReference", { reference: level.reference })}</figcaption>
      </figure>
      {canShareLevel(level) ? (
        <div className="level-card__share">
          {sharePreview ? (
            // A plain image of the card itself (lazy, sized up front so nothing shifts).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="level-card__preview"
              src="/api/share/level"
              alt={t("sharePreviewAlt", { label: level.label })}
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
              data-testid="share-preview"
            />
          ) : null}
          <p>
            {/* A plain link: the picture downloads, no JavaScript needed. */}
            <a className="text-link" href="/api/share/level" download="level.png">
              {t("share")}
            </a>
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * After a check-in: a level-up (and a new era) gets a small celebration; a
 * level-down gets one quiet line. Never notified to anyone else (§7.6).
 */
/** The level-change notice's id: the page's heading reads it out on arrival (A2-4). */
export const LEVEL_CHANGE_ID = "level-change";

export async function LevelChangeNotice({ change }: { change: LevelChange }) {
  if (change.kind === "same") return null;
  const t = await getTranslations("levels");
  if (change.kind === "down") {
    return (
      <p className="level-down" id={LEVEL_CHANGE_ID}>
        {t("down", { label: change.label })}
      </p>
    );
  }
  return (
    <section className="level-up" aria-labelledby="level-up-title" id={LEVEL_CHANGE_ID}>
      <div className="level-up__light" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {change.newEra ? (
        <Mountain aria-hidden="true" className="level-up__icon" />
      ) : (
        <Sparkles aria-hidden="true" className="level-up__icon" />
      )}
      <h2 id="level-up-title" className="level-up__title">
        {change.newEra ? t("eraTitle", { era: change.era }) : t("upTitle", { label: change.label })}
      </h2>
      <p>{change.newEra ? t("eraBody", { label: change.label }) : t("upBody")}</p>
    </section>
  );
}
