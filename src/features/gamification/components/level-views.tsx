import { Mountain, Sparkles } from "lucide-react";
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
export async function LevelCard({ level, headingLevel = "h2" }: { level: LevelOverview; headingLevel?: "h2" | "h3" }) {
  const t = await getTranslations("levels");
  const Heading = headingLevel;
  const dropped = level.missedSinceLast > 0 && level.level < level.storedLevel;
  return (
    <section className="ui-card level-card" aria-labelledby="level-card-title">
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
          <p className="level-card__kicker">{t("title")}</p>
          <Heading id="level-card-title" className="level-card__label">
            {level.label}
          </Heading>
          <p className="level-card__era">{t("levelAndEra", { level: level.level, era: level.era })}</p>
        </div>
      </div>
      <p className="level-card__progress">
        {t("progress", { done: level.progressDays, total: level.daysToNext, next: level.nextLabel })}
      </p>
      {dropped ? <p className="level-card__quiet">{t("down", { label: level.label })}</p> : null}
      {level.level === 0 && !dropped ? <p className="level-card__quiet">{t("clay")}</p> : null}
      <figure className="verse level-card__verse">
        <blockquote>
          <p>{level.verseText}</p>
        </blockquote>
        <figcaption>{t("verseReference", { reference: level.reference })}</figcaption>
      </figure>
      {canShareLevel(level) ? (
        <p>
          {/* A plain link: the picture downloads, no JavaScript needed. */}
          <a className="text-link" href="/api/share/level" download="level.png">
            {t("share")}
          </a>
        </p>
      ) : null}
    </section>
  );
}

/**
 * After a check-in: a level-up (and a new era) gets a small celebration; a
 * level-down gets one quiet line. Never notified to anyone else (§7.6).
 */
export async function LevelChangeNotice({ change }: { change: LevelChange }) {
  if (change.kind === "same") return null;
  const t = await getTranslations("levels");
  if (change.kind === "down") {
    return <p className="level-down">{t("down", { label: change.label })}</p>;
  }
  return (
    <section className="level-up" aria-labelledby="level-up-title">
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
