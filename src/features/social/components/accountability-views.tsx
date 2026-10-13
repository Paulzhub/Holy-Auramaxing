import { CircleAlert, HeartHandshake, Info } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button-variants";
import { avatarUrl } from "@/features/profile";
import { Link } from "@/i18n/navigation";

import { NUDGE_KINDS, PARTNERS_MAX, SOCIAL_LIMITS } from "../constants";
import { databaseErrorKeys } from "../errors";
import type { SocialErrorKey } from "../form-state";
import {
  askGroupToPrayAction,
  askPartnerToPrayAction,
  groupNudgeSettingsAction,
  nudgeAction,
  partnerAction,
  partnerAlertsAction,
  requestPartnerAction,
  socialSettingsAction,
} from "../server/accountability-actions";
import type { ActivePartner, Partnership, ReceivedNudge, SocialSettings } from "../server/accountability";

// Server components for nudges, partners and asking for prayer (CLAUDE.md
// §7.7, D-082 to D-085). Plain forms posting to Server Actions, so all of it
// works without JavaScript; choices that need confirming use <details>.

/** A "Nudge" button with the four nudges, for one member (Today panel, Members page). */
export async function NudgeControl({
  groupId,
  userId,
  name,
  sentToday,
  from,
}: {
  groupId: string;
  userId: string;
  name: string;
  sentToday: boolean;
  from: "home" | "members";
}) {
  const t = await getTranslations("social.nudges");
  if (sentToday) return <span className="today-chip">{t("sentToday")}</span>;
  return (
    <details className="group-confirm nudge-control">
      <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <span aria-hidden="true">{t("open")}</span>
        <span className="visually-hidden">{t("openFor", { name })}</span>
      </summary>
      <div className="group-confirm__body">
        <form action={nudgeAction.bind(null, groupId)} className="nudge-control__list">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="from" value={from} />
          {NUDGE_KINDS.map((kind) => (
            <button
              key={kind}
              type="submit"
              name="kind"
              value={kind}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
              aria-label={t("sendLabel", { kind: t(`kinds.${kind}`), name })}
            >
              {t(`kinds.${kind}`)}
            </button>
          ))}
        </form>
      </div>
    </details>
  );
}

/** Nudges I received lately. */
export async function NudgesForYou({ nudges, timeZone }: { nudges: ReceivedNudge[]; timeZone: string }) {
  const t = await getTranslations("social.nudges");
  const format = await getFormatter();
  if (!nudges.length) return null;
  return (
    <section className="ui-card nudges-for-you" aria-labelledby="nudges-for-you">
      <h2 id="nudges-for-you" className="ui-card__title">
        <HeartHandshake aria-hidden="true" className="inline-icon" /> {t("forYouTitle")}
      </h2>
      <ul className="nudges-for-you__list" data-testid="nudges-for-you">
        {nudges.map((n) => (
          <li key={n.id}>
            <span>{t("from", { name: n.fromName ?? t("someone"), kind: t(`kinds.${n.kind}`) })}</span>{" "}
            <time className="text-muted" dateTime={n.createdAt}>
              {format.dateTime(new Date(n.createdAt), {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
                timeZone,
              })}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A group's settings: whether I take nudges here. */
export async function GroupNudgeSettings({ groupId, muted }: { groupId: string; muted: boolean }) {
  const t = await getTranslations("social.nudges");
  return (
    <section className="profile-section" aria-labelledby="nudge-settings">
      <h2 id="nudge-settings" className="profile-section__title">
        {t("muteTitle")}
      </h2>
      <form action={groupNudgeSettingsAction.bind(null, groupId)} className="wall-form">
        <div className="auth-check">
          <input id="nudges-muted-group" type="checkbox" name="muted" defaultChecked={muted} />
          <label htmlFor="nudges-muted-group">{t("muteGroup")}</label>
        </div>
        <p className="ui-hint">{t("muteGroupHint")}</p>
        <div>
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("save")}
          </button>
        </div>
      </form>
    </section>
  );
}

/** Settings: nudges everywhere, and milestone cards. */
export async function SocialSettingsCard({ settings }: { settings: SocialSettings }) {
  const t = await getTranslations("social.nudges");
  return (
    <form action={socialSettingsAction} className="wall-form" id="social-settings">
      <div className="auth-check">
        <input id="nudges-muted-all" type="checkbox" name="nudgesMuted" defaultChecked={settings.nudgesMuted} />
        <label htmlFor="nudges-muted-all">{t("muteAll")}</label>
      </div>
      <div className="auth-check">
        <input
          id="milestone-cards"
          type="checkbox"
          name="milestoneCards"
          defaultChecked={settings.milestoneCards}
          aria-describedby="milestone-cards-hint"
        />
        <label htmlFor="milestone-cards">{t("milestoneCards")}</label>
      </div>
      <p className="ui-hint" id="milestone-cards-hint">
        {t("milestoneCardsHint")}
      </p>
      <div>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}

/** The Partner page: my partners, requests both ways, and asking someone. */
export async function PartnerPanel({
  groupId,
  partnerships,
  candidates,
  timeZone,
  archived,
}: {
  groupId: string;
  partnerships: Partnership[];
  candidates: { userId: string; name: string }[];
  timeZone: string;
  archived: boolean;
}) {
  const t = await getTranslations("social.partner");
  const format = await getFormatter();
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeZone });
  const active = partnerships.filter((p) => p.status === "active");
  const incoming = partnerships.filter((p) => p.status === "pending" && !p.askedByMe);
  const outgoing = partnerships.filter((p) => p.status === "pending" && p.askedByMe);
  const taken = new Set(partnerships.map((p) => p.partnerId));
  const askable = candidates.filter((c) => !taken.has(c.userId));
  const full = active.length + outgoing.length >= PARTNERS_MAX;

  const op = (id: string, value: keyof typeof labels, variant: "primary" | "secondary" | "ghost") => (
    <form action={partnerAction.bind(null, groupId)}>
      <input type="hidden" name="partnershipId" value={id} />
      <input type="hidden" name="op" value={value} />
      <button type="submit" className={buttonVariants({ variant, size: "sm" })}>
        {labels[value]}
      </button>
    </form>
  );
  const labels = { accept: t("accept"), decline: t("decline"), withdraw: t("withdraw"), end: t("end") };

  return (
    <div className="stack">
      <p className="page-lede">{t("lede", { max: PARTNERS_MAX })}</p>

      <section className="profile-section" aria-labelledby="partners-yours">
        <h2 id="partners-yours" className="profile-section__title">
          {t("yours")}
        </h2>
        {active.length ? (
          <ul className="group-list" data-testid="partner-list">
            {active.map((p) => (
              <li key={p.id} className="group-row partner-row">
                <Avatar
                  name={p.partnerName}
                  size="md"
                  decorative
                  src={avatarUrl(p.partnerId, p.partnerAvatarPath, "md")}
                />
                <div className="group-row__main">
                  <span className="group-row__title">{p.partnerName}</span>
                  {p.acceptedAt ? <span className="text-muted">{t("since", { date: date(p.acceptedAt) })}</span> : null}
                  <span className="text-muted">
                    {p.partnerAllowsAlerts
                      ? t("theyAllow", { name: p.partnerName })
                      : t("theyDont", { name: p.partnerName })}
                  </span>
                </div>
                <form action={partnerAlertsAction.bind(null, groupId)} className="partner-row__alerts">
                  <input type="hidden" name="partnershipId" value={p.id} />
                  <div className="auth-check">
                    <input
                      id={`alerts-${p.id}`}
                      type="checkbox"
                      name="allow"
                      defaultChecked={p.iAllowAlerts}
                      aria-describedby={`alerts-${p.id}-hint`}
                    />
                    <label htmlFor={`alerts-${p.id}`}>{t("alerts", { name: p.partnerName })}</label>
                  </div>
                  <p className="ui-hint" id={`alerts-${p.id}-hint`}>
                    {t("alertsHint")}
                  </p>
                  <div>
                    <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      {t("saveAlerts")}
                    </button>
                  </div>
                </form>
                <details className="group-confirm">
                  <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("end")}</summary>
                  <div className="group-confirm__body">
                    <p>{t("endQuestion", { name: p.partnerName })}</p>
                    <form action={partnerAction.bind(null, groupId)}>
                      <input type="hidden" name="partnershipId" value={p.id} />
                      <input type="hidden" name="op" value="end" />
                      <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        {t("endYes")}
                      </button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t("none")}</p>
        )}
      </section>

      {incoming.length ? (
        <section className="profile-section" aria-labelledby="partners-in">
          <h2 id="partners-in" className="profile-section__title">
            {t("requestsIn")}
          </h2>
          <ul className="group-list" data-testid="partner-requests-in">
            {incoming.map((p) => (
              <li key={p.id} className="group-row">
                <div className="group-row__main">
                  <span className="group-row__title">{p.partnerName}</span>
                  <span className="text-muted">{t("askedOn", { date: date(p.requestedAt) })}</span>
                </div>
                {!archived ? (
                  <div className="group-row__actions" role="group" aria-label={p.partnerName}>
                    {op(p.id, "accept", "primary")}
                    {op(p.id, "decline", "ghost")}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {outgoing.length ? (
        <section className="profile-section" aria-labelledby="partners-out">
          <h2 id="partners-out" className="profile-section__title">
            {t("requestsOut")}
          </h2>
          <ul className="group-list">
            {outgoing.map((p) => (
              <li key={p.id} className="group-row">
                <div className="group-row__main">
                  <span className="group-row__title">{p.partnerName}</span>
                  <span className="text-muted">{t("askedOn", { date: date(p.requestedAt) })}</span>
                </div>
                <div className="group-row__actions">{op(p.id, "withdraw", "ghost")}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!archived ? (
        <section className="profile-section" aria-labelledby="partners-ask">
          <h2 id="partners-ask" className="profile-section__title">
            {t("ask")}
          </h2>
          {full ? (
            <p className="text-muted">{t("full", { max: PARTNERS_MAX })}</p>
          ) : askable.length ? (
            <form action={requestPartnerAction.bind(null, groupId)} className="wall-form">
              <input type="hidden" name="from" value="partner" />
              <div className="ui-field">
                <label className="ui-label" htmlFor="partner-person">
                  {t("person")}
                </label>
                <p className="ui-hint" id="partner-person-hint">
                  {t("askHint")}
                </p>
                <select
                  id="partner-person"
                  name="userId"
                  className="ui-input"
                  aria-describedby="partner-person-hint"
                  required
                >
                  {askable.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
                  {t("askButton")}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-muted">{t("noOneToAsk")}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

const prayerResults = new Set<string>([
  "askedGroup",
  "askedPartner",
  ...databaseErrorKeys,
  "invalidInput",
  "rateLimited",
]);

/**
 * The slip page's prayer card (D-046): ask a group to pray (a prayer request
 * on its wall, with neutral words the person can change) or ask a partner (a
 * "please pray for me" nudge). Nothing here says what happened.
 */
export async function AskForPrayerCard({
  date,
  groups,
  partners,
  result,
}: {
  date: string;
  groups: { id: string; name: string }[];
  partners: ActivePartner[];
  result?: string;
}) {
  const t = await getTranslations("social");
  const shown = result && prayerResults.has(result) ? result : null;
  const done = shown === "askedGroup" || shown === "askedPartner";
  return (
    <section className="ui-card ask-prayer" aria-labelledby="prayer-title">
      <h2 id="prayer-title" className="ui-card__title" tabIndex={-1}>
        <HeartHandshake aria-hidden="true" className="inline-icon" /> {t("prayer.title")}
      </h2>
      <p>{t("prayer.body")}</p>
      {shown ? (
        done ? (
          <p className="auth-banner" role="status">
            <Info aria-hidden="true" />
            <span>{t(`prayer.${shown as "askedGroup" | "askedPartner"}`)}</span>
          </p>
        ) : (
          <p className="auth-banner auth-banner--error" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{t(`errors.${shown as SocialErrorKey}`)}</span>
          </p>
        )
      ) : null}
      {partners.length ? (
        <form action={askPartnerToPrayAction} className="ask-prayer__partners">
          <input type="hidden" name="date" value={date} />
          {partners.map((p) => (
            <button
              key={`${p.groupId}:${p.partnerId}`}
              type="submit"
              name="target"
              value={`${p.groupId}:${p.partnerId}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("prayer.askPartner", { name: p.name })}
            </button>
          ))}
        </form>
      ) : null}
      {groups.length ? (
        <form action={askGroupToPrayAction} className="wall-form">
          <input type="hidden" name="date" value={date} />
          {groups.length > 1 ? (
            <div className="ui-field">
              <label className="ui-label" htmlFor="prayer-group">
                {t("prayer.groupLabel")}
              </label>
              <select id="prayer-group" name="groupId" className="ui-input">
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="groupId" value={groups[0]!.id} />
          )}
          <div className="ui-field">
            <label className="ui-label" htmlFor="prayer-text">
              {t("prayer.text")}
            </label>
            <p className="ui-hint" id="prayer-text-hint">
              {t("prayer.textHint")}
            </p>
            <textarea
              id="prayer-text"
              name="body"
              className="ui-input wall-form__text"
              rows={2}
              maxLength={SOCIAL_LIMITS.postMax}
              defaultValue={t("prayer.defaultText")}
              aria-describedby="prayer-text-hint"
            />
          </div>
          <div>
            <button type="submit" className={buttonVariants({ variant: "primary" })}>
              {t("prayer.askGroup")}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-muted">{t("prayer.noGroups")}</p>
          <div>
            <Link href="/groups" className={buttonVariants({ variant: "secondary" })}>
              {t("prayer.openGroups")}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
