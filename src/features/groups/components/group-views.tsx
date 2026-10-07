import { CircleAlert, Info, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button-variants";
import { avatarUrl } from "@/features/profile";
import { Link } from "@/i18n/navigation";

import type { ShareLevel } from "../constants";
import { databaseErrorKeys } from "../errors";
import type { GroupErrorKey } from "../form-state";
import { groupPhase, type GroupPhase } from "../lifecycle";
import { groupPictureUrl } from "../picture-url";
import {
  archiveGroupAction,
  deleteGroupAction,
  leaveGroupAction,
  memberAction,
  proposalAction,
} from "../server/actions";
import type { GroupContext, MemberCard, MyGroupItem, OpenProposal } from "../server/queries";

// Server components for the groups pages. Every control here is a plain
// form posting to a Server Action, so none of it needs JavaScript;
// confirmations use <details> (the second button only appears when asked).

type Params = string | string[] | undefined;
const first = (v: Params) => (Array.isArray(v) ? v[0] : v);

const notices = [
  "created",
  "saved",
  "roleChanged",
  "removed",
  "allowedBack",
  "approved",
  "declined",
  "transferred",
  "archived",
  "unarchived",
  "deleted",
  "left",
  "withdrawn",
  "inviteRevoked",
  "covenantAgreed",
  "covenantNowApplies",
  "covenantDeclined",
  "covenantWithdrawn",
  "joined",
  "requested",
] as const;
type Notice = (typeof notices)[number];

const knownErrors = new Set<string>([...databaseErrorKeys, "rateLimited", "saveFailed"]);

/** A known ?notice= or ?error= value; anything else is ignored, so the URL can't inject text. */
export async function GroupNotice({ notice, error }: { notice: Params; error: Params }) {
  const t = await getTranslations("groups");
  const n = first(notice);
  const e = first(error);
  if (e && knownErrors.has(e)) {
    return (
      <p className="auth-banner auth-banner--error" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{t(`errors.${e as GroupErrorKey}`)}</span>
      </p>
    );
  }
  if (n && (notices as readonly string[]).includes(n)) {
    return (
      <p className="auth-banner" role="status">
        <Info aria-hidden="true" />
        <span>{t(`notices.${n as Notice}`)}</span>
      </p>
    );
  }
  return null;
}

export async function PhaseText({ phase }: { phase: GroupPhase }) {
  const t = await getTranslations("groups.phase");
  switch (phase.phase) {
    case "archived":
      return <>{t("archived")}</>;
    case "scheduled":
      return <>{t("scheduled", { count: phase.startsIn })}</>;
    case "completed":
      return <>{t("completed", { total: phase.total })}</>;
    default:
      return (
        <>
          {phase.total === null
            ? t("ongoing", { day: phase.day })
            : t("active", { day: phase.day, total: phase.total })}
        </>
      );
  }
}

/** The group's name, picture and day, with its tabs. */
export async function GroupHeader({
  ctx,
  current,
}: {
  ctx: GroupContext;
  current: "home" | "members" | "invites" | "settings";
}) {
  const t = await getTranslations("groups");
  const { group } = ctx;
  type Tab = { key: "home" | "members" | "invites" | "settings"; href: string };
  const tabs: Tab[] = [
    { key: "home", href: `/groups/${group.id}` },
    { key: "members", href: `/groups/${group.id}/members` },
    ...(ctx.isAdmin ? [{ key: "invites", href: `/groups/${group.id}/invites` } as Tab] : []),
    { key: "settings", href: `/groups/${group.id}/settings` },
  ];
  return (
    <header className="group-header">
      <div className="group-header__row">
        <Avatar
          name={group.name}
          src={groupPictureUrl(group.id, group.coverPath, "lg")}
          size="lg"
          shape="square"
          decorative
        />
        <div className="group-header__text">
          <h1 className="page-title group-header__name">{group.name}</h1>
          <p className="group-header__meta">
            <PhaseText
              phase={groupPhase({
                start_date: group.startDate,
                end_date: group.endDate,
                group_timezone: group.timezone,
                archived_at: group.archivedAt,
              })}
            />
            {" · "}
            {t("home.members", { count: group.memberCount })}
            {" · "}
            {t(`roles.${ctx.me.role}`)}
          </p>
        </div>
      </div>
      <nav className="group-tabs" aria-label={t("nav.label")}>
        <ul>
          {tabs.map((tab) => (
            <li key={tab.key}>
              <Link
                href={tab.href}
                className="group-tabs__link"
                aria-current={tab.key === current ? "page" : undefined}
              >
                {t(`nav.${tab.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

/** /groups: my groups, requests waiting, and archived groups. */
export async function GroupList({ groups }: { groups: MyGroupItem[] }) {
  const t = await getTranslations("groups");
  const active = groups.filter((g) => g.status === "active" && !g.archivedAt);
  const pending = groups.filter((g) => g.status === "pending");
  const archived = groups.filter((g) => g.status === "active" && g.archivedAt);

  const card = async (g: MyGroupItem) => (
    <li key={g.id} className="group-row">
      <Avatar name={g.name} src={g.pictureUrl} size="md" shape="square" decorative />
      <div className="group-row__main">
        {g.status === "active" ? (
          <Link href={`/groups/${g.id}`} className="group-row__title group-row__link">
            {g.name}
          </Link>
        ) : (
          <span className="group-row__title">{g.name}</span>
        )}
        <span className="text-muted">
          {g.status === "pending" ? (
            t("list.waiting")
          ) : (
            <>
              <PhaseText
                phase={groupPhase({
                  start_date: g.startDate,
                  end_date: g.endDate,
                  group_timezone: g.timezone,
                  archived_at: g.archivedAt,
                })}
              />
              {" · "}
              {t("list.members", { count: g.memberCount })}
              {" · "}
              {t(`roles.${g.role}`)}
            </>
          )}
        </span>
      </div>
      {g.status === "pending" ? (
        <form action={leaveGroupAction.bind(null, g.id)} className="group-row__actions">
          <input type="hidden" name="withdraw" value="yes" />
          <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("list.withdraw")}
          </button>
        </form>
      ) : null}
    </li>
  );

  return (
    <div className="stack">
      {active.length ? (
        <section aria-labelledby="my-groups-title" className="stack-sm">
          <h2 id="my-groups-title" className="profile-section__title">
            {t("list.yourGroups")}
          </h2>
          <ul className="group-list">{await Promise.all(active.map(card))}</ul>
        </section>
      ) : null}
      {pending.length ? (
        <section aria-labelledby="pending-groups-title" className="stack-sm">
          <h2 id="pending-groups-title" className="profile-section__title">
            {t("list.waitingTitle")}
          </h2>
          <ul className="group-list">{await Promise.all(pending.map(card))}</ul>
        </section>
      ) : null}
      {archived.length ? (
        <section aria-labelledby="archived-groups-title" className="stack-sm">
          <h2 id="archived-groups-title" className="profile-section__title">
            {t("list.archivedTitle")}
          </h2>
          <ul className="group-list">{await Promise.all(archived.map(card))}</ul>
        </section>
      ) : null}
    </div>
  );
}

/** What everyone agreed to, and the accountability level (D-027). */
export async function CovenantSummary({
  text,
  minShareLevel,
  hidingAllowed,
  headingLevel = "h2",
}: {
  text: string;
  minShareLevel: ShareLevel;
  hidingAllowed: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const t = await getTranslations("groups");
  const Heading = headingLevel;
  return (
    <section className="profile-section group-covenant" aria-labelledby="covenant-summary-title">
      <Heading id="covenant-summary-title" className="profile-section__title">
        {t("covenantInfo.title")}
      </Heading>
      <blockquote className="group-covenant__text">{text}</blockquote>
      <ul className="group-covenant__terms">
        <li>{t("covenantInfo.minimum", { level: t(`shareLevels.${minShareLevel}.label`) })}</li>
        <li>{hidingAllowed ? t("covenantInfo.hidingAllowed") : t("covenantInfo.hidingNotAllowed")}</li>
      </ul>
      <p className="text-muted">{t("covenantInfo.explain")}</p>
    </section>
  );
}

/** An open covenant change: members agree or decline; the owner can withdraw. */
export async function ProposalCard({
  ctx,
  proposal,
  from = "home",
}: {
  ctx: GroupContext;
  proposal: OpenProposal;
  from?: "home" | "settings";
}) {
  const t = await getTranslations("groups");
  const format = await getFormatter();
  const action = proposalAction.bind(null, ctx.group.id);
  const hidden = (op: string) => (
    <>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="proposalId" value={proposal.id} />
      <input type="hidden" name="from" value={from} />
    </>
  );
  return (
    <section className="profile-section group-proposal" aria-labelledby="proposal-title">
      <h2 id="proposal-title" className="profile-section__title">
        {t("proposal.title")}
      </h2>
      <p>{t("proposal.lede")}</p>
      <div className="group-proposal__compare">
        <div>
          <h3 className="group-proposal__label">{t("proposal.current")}</h3>
          <blockquote className="group-covenant__text">{ctx.group.covenantText}</blockquote>
          <p className="text-muted">
            {t("covenantInfo.minimum", { level: t(`shareLevels.${ctx.group.minShareLevel}.label`) })}{" "}
            {ctx.group.leaderboardHidingAllowed ? t("covenantInfo.hidingAllowed") : t("covenantInfo.hidingNotAllowed")}
          </p>
        </div>
        <div>
          <h3 className="group-proposal__label">{t("proposal.proposed")}</h3>
          <blockquote className="group-covenant__text">{proposal.covenantText}</blockquote>
          <p className="text-muted">
            {t("covenantInfo.minimum", { level: t(`shareLevels.${proposal.minShareLevel}.label`) })}{" "}
            {proposal.leaderboardHidingAllowed ? t("covenantInfo.hidingAllowed") : t("covenantInfo.hidingNotAllowed")}
          </p>
        </div>
      </div>
      <p>
        {t("proposal.progress", { done: proposal.agreed, needed: proposal.needed })}{" "}
        {t("proposal.expires", { date: format.dateTime(new Date(proposal.expiresAt), { dateStyle: "medium" }) })}
      </p>
      {ctx.isOwner ? (
        <form action={action}>
          {hidden("withdraw")}
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            {t("proposal.withdraw")}
          </button>
        </form>
      ) : proposal.iAgreed ? (
        <p className="group-status">{t("proposal.youAgreed")}</p>
      ) : (
        <div className="profile-actions">
          <form action={action}>
            {hidden("agree")}
            <button type="submit" className={buttonVariants({ variant: "primary" })}>
              {t("proposal.agree")}
            </button>
          </form>
          <form action={action}>
            {hidden("decline")}
            <button type="submit" className={buttonVariants({ variant: "ghost" })}>
              {t("proposal.decline")}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function MemberOpForm({
  groupId,
  userId,
  op,
  label,
  variant = "secondary",
}: {
  groupId: string;
  userId: string;
  op: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <form action={memberAction.bind(null, groupId)}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className={buttonVariants({ variant, size: "sm" })}>
        {label}
      </button>
    </form>
  );
}

function ConfirmOp({
  groupId,
  userId,
  op,
  label,
  question,
  confirm,
}: {
  groupId: string;
  userId: string;
  op: string;
  label: string;
  question: string;
  confirm: string;
}) {
  return (
    <details className="group-confirm">
      <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>{label}</summary>
      <div className="group-confirm__body">
        <p>{question}</p>
        <MemberOpForm groupId={groupId} userId={userId} op={op} label={confirm} />
      </div>
    </details>
  );
}

/** The Members page: who's here, and what the viewer may do about it. */
export async function MemberList({ ctx, members }: { ctx: GroupContext; members: MemberCard[] }) {
  const t = await getTranslations("groups");
  const format = await getFormatter();
  const gid = ctx.group.id;
  const archived = Boolean(ctx.group.archivedAt);
  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending");
  const removed = members.filter((m) => m.status === "removed");
  const since = (iso: string | null) =>
    iso ? t("members.since", { date: format.dateTime(new Date(iso), { dateStyle: "medium" }) }) : "";

  const person = (m: MemberCard, extra?: string) => (
    <>
      <Avatar name={m.name} size="md" decorative src={avatarUrl(m.userId, m.avatarPath, "md")} />
      <div className="group-row__main">
        <span className="group-row__title">
          {m.name}
          {m.userId === ctx.userId ? <span className="group-badge">{t("members.you")}</span> : null}
          {m.role !== "member" ? <span className="group-badge group-badge--role">{t(`roles.${m.role}`)}</span> : null}
        </span>
        {extra ? <span className="text-muted">{extra}</span> : null}
      </div>
    </>
  );

  return (
    <div className="stack">
      <section className="profile-section" aria-labelledby="members-title">
        <h2 id="members-title" className="profile-section__title">
          {t("members.activeTitle")}
        </h2>
        <ul className="group-list" data-testid="member-list">
          {active.map((m) => {
            const self = m.userId === ctx.userId;
            const canRemove =
              !self && !archived && m.role !== "owner" && (ctx.isOwner || (ctx.isAdmin && m.role === "member"));
            const canRole = !self && !archived && ctx.isOwner && m.role !== "owner";
            return (
              <li key={m.userId} className="group-row">
                {person(m, since(m.joinedAt))}
                {canRemove || canRole ? (
                  <div
                    className="group-row__actions"
                    role="group"
                    aria-label={t("members.actionsFor", { name: m.name })}
                  >
                    {canRole ? (
                      <MemberOpForm
                        groupId={gid}
                        userId={m.userId}
                        op={m.role === "admin" ? "demote" : "promote"}
                        label={m.role === "admin" ? t("members.makeMember") : t("members.makeAdmin")}
                      />
                    ) : null}
                    {canRole ? (
                      <ConfirmOp
                        groupId={gid}
                        userId={m.userId}
                        op="transfer"
                        label={t("members.makeOwner")}
                        question={t("members.confirmOwner", { name: m.name })}
                        confirm={t("members.confirmOwnerYes")}
                      />
                    ) : null}
                    {canRemove ? (
                      <ConfirmOp
                        groupId={gid}
                        userId={m.userId}
                        op="remove"
                        label={t("members.remove")}
                        question={t("members.confirmRemove", { name: m.name })}
                        confirm={t("members.confirmRemoveYes")}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {ctx.isAdmin ? (
        <section className="profile-section" aria-labelledby="pending-title">
          <h2 id="pending-title" className="profile-section__title">
            {t("members.pendingTitle")}
          </h2>
          {pending.length ? (
            <ul className="group-list" data-testid="pending-list">
              {pending.map((m) => (
                <li key={m.userId} className="group-row">
                  {person(m)}
                  {!archived ? (
                    <div
                      className="group-row__actions"
                      role="group"
                      aria-label={t("members.actionsFor", { name: m.name })}
                    >
                      <MemberOpForm
                        groupId={gid}
                        userId={m.userId}
                        op="approve"
                        label={t("members.approve")}
                        variant="primary"
                      />
                      <MemberOpForm
                        groupId={gid}
                        userId={m.userId}
                        op="decline"
                        label={t("members.decline")}
                        variant="ghost"
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{t("members.pendingEmpty")}</p>
          )}
        </section>
      ) : null}

      {ctx.isAdmin && removed.length ? (
        <section className="profile-section" aria-labelledby="removed-title">
          <h2 id="removed-title" className="profile-section__title">
            {t("members.removedTitle")}
          </h2>
          <p className="text-muted">{t("members.removedHint")}</p>
          <ul className="group-list">
            {removed.map((m) => (
              <li key={m.userId} className="group-row">
                {person(m)}
                <div className="group-row__actions">
                  <MemberOpForm groupId={gid} userId={m.userId} op="allowBack" label={t("members.allowBack")} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Leave (members and admins) or the owner's note about handing over first. */
export async function LeaveGroupSection({ ctx }: { ctx: GroupContext }) {
  const t = await getTranslations("groups.settings");
  return (
    <section className="profile-section" aria-labelledby="leave-title">
      <h2 id="leave-title" className="profile-section__title">
        {t("leaveTitle")}
      </h2>
      {ctx.isOwner ? (
        <p className="text-muted">{t("ownerLeave")}</p>
      ) : (
        <>
          <p className="text-muted">{t("leaveBody")}</p>
          <details className="group-confirm">
            <summary className={buttonVariants({ variant: "secondary" })}>{t("leave")}</summary>
            <form action={leaveGroupAction.bind(null, ctx.group.id)} className="group-confirm__body">
              <button type="submit" className={buttonVariants({ variant: "primary" })}>
                {t("confirmLeave")}
              </button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}

/** The owner's hand-over, archive and delete (CLAUDE.md §7.4). */
export async function DangerZone({ ctx, members, error }: { ctx: GroupContext; members: MemberCard[]; error: Params }) {
  const t = await getTranslations("groups");
  const gid = ctx.group.id;
  const others = members.filter((m) => m.status === "active" && m.userId !== ctx.userId);
  const nameError = first(error) === "nameMismatch";
  return (
    <section className="profile-section" aria-labelledby="danger-title">
      <h2 id="danger-title" className="profile-section__title">
        {t("settings.dangerTitle")}
      </h2>

      <div className="group-danger">
        <h3 className="group-danger__title">{t("settings.transferTitle")}</h3>
        {others.length && !ctx.group.archivedAt ? (
          <form action={memberAction.bind(null, gid)} className="grid gap-3">
            <input type="hidden" name="op" value="transfer" />
            <input type="hidden" name="from" value="settings" />
            <div className="ui-field">
              <label className="ui-label" htmlFor="transfer-userId">
                {t("settings.transferTo")}
              </label>
              <p className="ui-hint" id="transfer-userId-hint">
                {t("settings.transferHint")}
              </p>
              <select id="transfer-userId" name="userId" className="ui-input" aria-describedby="transfer-userId-hint">
                {others.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button type="submit" className={buttonVariants({ variant: "secondary" })}>
                {t("settings.transfer")}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-muted">{t("settings.transferNone")}</p>
        )}
      </div>

      <div className="group-danger">
        <h3 className="group-danger__title">{t("settings.archiveTitle")}</h3>
        <p className="text-muted">{t("settings.archiveBody")}</p>
        <form action={archiveGroupAction.bind(null, gid)}>
          {ctx.group.archivedAt ? <input type="hidden" name="restore" value="yes" /> : null}
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            {ctx.group.archivedAt ? t("settings.unarchive") : t("settings.archive")}
          </button>
        </form>
      </div>

      <div className="group-danger" id="delete">
        <h3 className="group-danger__title">{t("settings.deleteTitle")}</h3>
        <p className="text-muted">{t("settings.deleteBody")}</p>
        <form action={deleteGroupAction.bind(null, gid)} className="grid gap-3" noValidate>
          <div className="ui-field">
            <label className="ui-label" htmlFor="delete-confirmName">
              {t("fields.confirmName")}
            </label>
            <input
              id="delete-confirmName"
              name="confirmName"
              className="ui-input"
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "delete-confirmName-error" : undefined}
            />
            {nameError ? (
              <p className="ui-error-text" id="delete-confirmName-error">
                <CircleAlert aria-hidden="true" />
                <span>{t("errors.nameMismatch")}</span>
              </p>
            ) : null}
          </div>
          <div>
            <button type="submit" className={buttonVariants({ variant: "primary" })}>
              {t("settings.delete")}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

/** Placeholder cards for what later phases bring to a group's home. */
export async function GroupHomeSkeleton({ ctx }: { ctx: GroupContext }) {
  const t = await getTranslations("groups.home");
  const card = (key: "today" | "leaderboard" | "wall" | "together") => (
    <section key={key} className="ui-card group-placeholder" aria-labelledby={`home-${key}`}>
      <h2 id={`home-${key}`} className="ui-card__title">
        {t(`${key}Title`)}
      </h2>
      <p className="text-muted">{t(`${key}Body`)}</p>
    </section>
  );
  return (
    <div className="group-home-grid">
      {ctx.group.memberCount === 1 && ctx.isAdmin && !ctx.group.archivedAt ? (
        <section className="ui-card group-placeholder group-placeholder--invite">
          <Users aria-hidden="true" />
          <p>{t("inviteNudge")}</p>
          <Link href={`/groups/${ctx.group.id}/invites`} className={buttonVariants({ variant: "primary" })}>
            {t("inviteLink")}
          </Link>
        </section>
      ) : null}
      {card("today")}
      {card("leaderboard")}
      {card("wall")}
      {card("together")}
    </div>
  );
}
