import {
  AlarmClock,
  Anchor,
  Armchair,
  Award,
  Bird,
  CalendarCheck,
  Crown,
  Feather,
  Flag,
  Footprints,
  HandHeart,
  HandHelping,
  MessageSquareQuote,
  Mountain,
  Sprout,
  Sun,
  Sunrise,
  TreeDeciduous,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { getBadgeCatalog, type Badge, type XpAndBadges } from "../server/queries";

/**
 * XP and badges (CLAUDE.md §7.6, D-071, D-072). Server components: no
 * JavaScript reaches the browser. The person's own XP and badges show on
 * Progress and Home; a group sees a member's badges (names only, no verse)
 * only where that member shares their streak or more, like the level.
 */

const ICONS: Record<string, LucideIcon> = {
  sunrise: Sunrise,
  sprout: Sprout,
  armchair: Armchair,
  footprints: Footprints,
  "tree-deciduous": TreeDeciduous,
  sun: Sun,
  mountain: Mountain,
  anchor: Anchor,
  bird: Bird,
  feather: Feather,
  crown: Crown,
  "calendar-check": CalendarCheck,
  "alarm-clock": AlarmClock,
  wheat: Wheat,
  flag: Flag,
  "hand-heart": HandHeart,
  "hand-helping": HandHelping,
  "message-square-quote": MessageSquareQuote,
};

export function badgeIcon(icon: string): LucideIcon {
  return ICONS[icon] ?? Award;
}

const NEW_FOR_MS = 3 * 24 * 60 * 60 * 1000;

/** XP and badges on Progress: total, how XP works, earned badges, what's next. */
export async function XpBadgesCard({ data, now = new Date() }: { data: XpAndBadges; now?: Date }) {
  const [t, format] = await Promise.all([getTranslations("badges"), getFormatter()]);
  const name = (b: Badge) => t(`items.${b.slug}.name` as "items.free_1.name");
  const description = (b: Badge) => t(`items.${b.slug}.description` as "items.free_1.description");
  return (
    <section className="ui-card badges-card" aria-labelledby="xp-title">
      <div className="badges-card__xp">
        <h2 id="xp-title" className="badges-card__title">
          {t("xpTitle")}
        </h2>
        <p className="badges-card__total" data-testid="xp-total">
          {t("xp", { xp: data.xp })}
        </p>
        <p className="text-muted">{t("xpHow")}</p>
      </div>

      <div className="badges-card__section">
        <h3 className="badges-card__subtitle">{t("title")}</h3>
        {data.earned.length === 0 ? (
          <p className="text-muted">{t("none")}</p>
        ) : (
          <ul className="badge-list" data-testid="badge-list">
            {data.earned.map((b) => {
              const Icon = badgeIcon(b.icon);
              const isNew = now.getTime() - new Date(b.earnedAt).getTime() < NEW_FOR_MS;
              return (
                <li key={b.slug} className="badge-item">
                  <span className="badge-item__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <div className="badge-item__main">
                    <p className="badge-item__name">
                      <span>{name(b)}</span>
                      {isNew ? <span className="group-badge">{t("new")}</span> : null}
                    </p>
                    <p className="badge-item__description">{description(b)}</p>
                    <figure className="verse badge-item__verse">
                      <blockquote>
                        <p>{b.verseText}</p>
                      </blockquote>
                      <figcaption>{t("verseReference", { reference: b.reference })}</figcaption>
                    </figure>
                    <p className="badge-item__date text-muted">
                      {t("earnedOn", { date: format.dateTime(new Date(b.earnedAt), { dateStyle: "medium" }) })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-muted">{t("kept")}</p>
      </div>

      {data.next.length > 0 ? (
        <div className="badges-card__section">
          <h3 className="badges-card__subtitle">{t("nextTitle")}</h3>
          <ul className="badge-list badge-list--next">
            {data.next.map((b) => {
              const Icon = badgeIcon(b.icon);
              return (
                <li key={b.slug} className="badge-item badge-item--next">
                  <span className="badge-item__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <div className="badge-item__main">
                    <p className="badge-item__name">{name(b)}</p>
                    <p className="badge-item__description">{description(b)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** One line on Home: the XP total, linking nowhere new (Progress has the rest). */
export async function XpLine({ xp }: { xp: number }) {
  const t = await getTranslations("badges");
  return (
    <p className="xp-line" data-testid="xp-line">
      {t("xp", { xp })}
    </p>
  );
}

/**
 * A member's badges in a group's member list: icons and names only. `slugs`
 * is null when the member doesn't share their streak with the viewer.
 */
export async function MemberBadges({ slugs }: { slugs: string[] | null }) {
  if (!slugs?.length) return null;
  const [t, catalog] = await Promise.all([getTranslations("badges"), getBadgeCatalog()]);
  return (
    <ul className="member-badges" aria-label={t("memberBadges")}>
      {slugs.map((slug) => {
        const Icon = badgeIcon(catalog.get(slug)?.icon ?? "");
        return (
          <li key={slug} className="member-badges__item">
            <Icon aria-hidden="true" />
            <span>{t(`items.${slug}.name` as "items.free_1.name")}</span>
          </li>
        );
      })}
    </ul>
  );
}
