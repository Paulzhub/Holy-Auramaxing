import {
  BicepsFlexed,
  Bird,
  CircleAlert,
  Flame,
  HandHeart,
  Heart,
  Info,
  Pin,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button-variants";
import { avatarUrl } from "@/features/profile";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

import {
  REACTION_KINDS,
  REPORT_REASONS,
  SOCIAL_LIMITS,
  WALL_FILTERS,
  type ReactionKind,
  type WallFilter,
} from "../constants";
import { databaseErrorKeys } from "../errors";
import type { SocialErrorKey } from "../form-state";
import {
  blockAction,
  deleteCommentAction,
  deletePostAction,
  pinPostAction,
  reactAction,
  reportAction,
  resolveReportAction,
  unblockAction,
} from "../server/actions";
import { reactCheckinAction } from "../server/accountability-actions";
import type {
  Author,
  BlockedPerson,
  OpenReport,
  ReactionCount,
  WallComment,
  WallPage,
  WallPost,
} from "../server/queries";
import { EditTextForm } from "./wall-forms";

// Server components for the wall (CLAUDE.md §7.7). Everyone's words are
// rendered as React text, never as HTML, so markup in a post shows as typed
// (D-081). Every control is a plain form posting to a Server Action, so the
// wall works without JavaScript; confirmations use <details>.

type Params = string | string[] | undefined;
const first = (v: Params) => (Array.isArray(v) ? v[0] : v);

/** Who is looking, and what they may do here. */
export interface WallViewer {
  groupId: string;
  userId: string;
  isAdmin: boolean;
  archived: boolean;
  /** The viewer's own time zone, for dates and times. */
  timeZone: string;
}

type From = "wall" | "post" | "home";

const icons: Record<ReactionKind, LucideIcon> = {
  pray: HandHeart,
  heart: Heart,
  fire: Flame,
  strong: BicepsFlexed,
  dove: Bird,
};

const notices = [
  "postDeleted",
  "commentDeleted",
  "pinned",
  "unpinned",
  "reported",
  "blocked",
  "unblocked",
  "reportActioned",
  "reportDismissed",
  "nudged",
  "partnerAsked",
  "partnerAccepted",
  "partnerDeclined",
  "partnerWithdrawn",
  "partnerEnded",
  "alertsSaved",
  "nudgeSettingsSaved",
] as const;
type Notice = (typeof notices)[number];
const knownErrors = new Set<string>([...databaseErrorKeys, "saveFailed", "reasonMissing", "noteTooLong"]);

/** A known ?notice= or ?error= value; anything else is ignored, so the URL can't inject text. */
export async function SocialNotice({ notice, error }: { notice: Params; error: Params }) {
  const t = await getTranslations("social");
  const n = first(notice);
  const e = first(error);
  if (e && knownErrors.has(e)) {
    return (
      <p className="auth-banner auth-banner--error" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{t(`errors.${e as SocialErrorKey}`)}</span>
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

/** Filters as links (no JavaScript). */
export async function WallFilters({ groupId, filter }: { groupId: string; filter: WallFilter }) {
  const t = await getTranslations("social.wall");
  return (
    <nav className="wall-filters" aria-label={t("filtersLabel")}>
      <ul>
        {WALL_FILTERS.map((f) => (
          <li key={f}>
            <Link
              href={f === "all" ? `/groups/${groupId}/wall` : `/groups/${groupId}/wall?kind=${f}`}
              className="wall-filters__link"
              aria-current={f === filter ? "page" : undefined}
            >
              {t(`filters.${f}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function authorName(author: Author, fallback: string): string {
  return author.name || fallback;
}

/** A post's words: what was written, or for a milestone card, what was reached (D-085). */
async function postText(post: WallPost, name: string): Promise<string> {
  if (post.kind !== "milestone" || !post.badge) return post.body;
  const [t, tb] = await Promise.all([getTranslations("social.milestone"), getTranslations("badges")]);
  const badge = tb(`items.${post.badge}.name` as "items.free_1.name");
  const days = Number(post.badge.replace(/^free_/, "")) || 0;
  return post.isMine ? t("you", { badge, days }) : t("reached", { name, badge, days });
}

async function When({ iso, timeZone }: { iso: string; timeZone: string }) {
  const format = await getFormatter();
  return (
    <time dateTime={iso}>{format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone })}</time>
  );
}

/** The five reactions as buttons in one form: each says what pressing it does. */
async function Reactions({
  viewer,
  targetType,
  target,
  postId,
  reactions,
  from,
  prayerRequest = false,
}: {
  viewer: WallViewer;
  targetType: "post" | "comment";
  target: string;
  postId: string;
  reactions: ReactionCount[];
  from: From;
  prayerRequest?: boolean;
}) {
  const t = await getTranslations();
  const kindLabel = (kind: ReactionKind) =>
    prayerRequest && kind === "pray" ? t("social.reactions.iPrayed") : t(`ui.reactions.kinds.${kind}`);
  if (viewer.archived) {
    return (
      <ul className="ui-reactions" aria-label={t("social.reactions.label")}>
        {reactions
          .filter((r) => r.count > 0)
          .map(({ kind, count }) => {
            const Icon = icons[kind];
            return (
              <li key={kind} className="ui-reaction wall-reaction--static">
                <Icon aria-hidden="true" />
                <span aria-hidden="true">{count}</span>
                <span className="visually-hidden">
                  {t("ui.reactions.buttonLabel", { reaction: kindLabel(kind), count })}
                </span>
              </li>
            );
          })}
      </ul>
    );
  }
  return (
    <form action={reactAction.bind(null, viewer.groupId)} className="wall-reactions">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="from" value={from} />
      <ul className="ui-reactions" aria-label={t("social.reactions.label")}>
        {REACTION_KINDS.map((kind) => {
          const r = reactions.find((x) => x.kind === kind) ?? { kind, count: 0, mine: false };
          const Icon = icons[kind];
          const showWord = prayerRequest && kind === "pray";
          return (
            <li key={kind}>
              <button
                type="submit"
                name="reaction"
                value={`${kind}:${r.mine ? 0 : 1}`}
                className={cn("ui-reaction", showWord && "wall-reaction--prayed")}
                aria-pressed={r.mine}
              >
                <Icon aria-hidden="true" />
                {showWord ? (
                  <span aria-hidden="true">
                    {r.mine ? t("social.reactions.iPrayedDone") : t("social.reactions.iPrayed")} · {r.count}
                  </span>
                ) : (
                  <span aria-hidden="true">{r.count}</span>
                )}
                <span className="visually-hidden">
                  {r.mine
                    ? t("social.reactions.remove", { reaction: kindLabel(kind), count: r.count })
                    : t("social.reactions.add", { reaction: kindLabel(kind), count: r.count })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </form>
  );
}

/** "Delete" (mine) or "Remove" (an admin, someone else's), confirmed in a <details>. */
async function DeleteControl({
  action,
  mine,
  from,
}: {
  action: (formData: FormData) => Promise<void>;
  mine: boolean;
  from?: string;
}) {
  const t = await getTranslations("social.manage");
  return (
    <details className="group-confirm">
      <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>{mine ? t("delete") : t("remove")}</summary>
      <div className="group-confirm__body">
        <p>{mine ? t("deleteQuestion") : t("removeQuestion")}</p>
        <form action={action}>
          {from ? <input type="hidden" name="from" value={from} /> : null}
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {mine ? t("deleteYes") : t("removeYes")}
          </button>
        </form>
      </div>
    </details>
  );
}

async function ReportControl({
  viewer,
  targetType,
  target,
  postId,
  from,
  label,
}: {
  viewer: WallViewer;
  targetType: "post" | "comment" | "member";
  target: string;
  postId?: string;
  from: string;
  label?: string;
}) {
  const t = await getTranslations("social.report");
  const idBase = `report-${targetType}-${target}`;
  return (
    <details className="group-confirm wall-report">
      <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>{label ?? t("open")}</summary>
      <div className="group-confirm__body">
        <form action={reportAction.bind(null, viewer.groupId)} className="wall-report__form">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="target" value={target} />
          {postId ? <input type="hidden" name="postId" value={postId} /> : null}
          <input type="hidden" name="from" value={from} />
          <p className="wall-report__title">{t("title")}</p>
          <p className="text-muted">{t("lede")}</p>
          <fieldset className="wall-report__reasons">
            <legend className="ui-label">{t("reason")}</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="wall-kind-choice" htmlFor={`${idBase}-${r}`}>
                <input id={`${idBase}-${r}`} type="radio" name="reason" value={r} required />
                <span>{t(`reasons.${r}`)}</span>
              </label>
            ))}
          </fieldset>
          <p className="ui-hint">{t("unsafeHint")}</p>
          <div className="ui-field">
            <label className="ui-label" htmlFor={`${idBase}-note`}>
              {t("note")}
            </label>
            <textarea
              id={`${idBase}-note`}
              name="note"
              className="ui-input"
              rows={2}
              maxLength={SOCIAL_LIMITS.reportNoteMax}
            />
          </div>
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("send")}
          </button>
        </form>
      </div>
    </details>
  );
}

async function BlockControl({
  viewer,
  userId,
  name,
  from,
  withName = false,
}: {
  viewer: WallViewer;
  userId: string;
  name: string;
  from: string;
  withName?: boolean;
}) {
  const t = await getTranslations("social.block");
  return (
    <details className="group-confirm">
      <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>
        {withName ? t("openMember", { name }) : t("open")}
      </summary>
      <div className="group-confirm__body">
        <p>{name ? t("question", { name }) : t("questionNoName")}</p>
        <form action={blockAction.bind(null, viewer.groupId)}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="from" value={from} />
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("yes")}
          </button>
        </form>
      </div>
    </details>
  );
}

/** Report and block on the Members page. */
export async function MemberSafetyTools({
  viewer,
  userId,
  name,
}: {
  viewer: WallViewer;
  userId: string;
  name: string;
}) {
  const t = await getTranslations("social");
  return (
    <>
      <ReportControl
        viewer={viewer}
        targetType="member"
        target={userId}
        from="members"
        label={t("report.openMember", { name })}
      />
      <BlockControl viewer={viewer} userId={userId} name={name} from="members" withName />
    </>
  );
}

/** One post: who, what kind, when, the words, reactions, and what the viewer may do. */
export async function PostCard({
  viewer,
  post,
  from,
  headingLevel = 3,
}: {
  viewer: WallViewer;
  post: WallPost;
  from: From;
  headingLevel?: 2 | 3;
}) {
  const t = await getTranslations("social");
  const name = post.isMine ? t("post.you") : authorName(post.author, t("post.formerMember"));
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingId = `post-${post.id}-by`;
  const postHref = `/groups/${viewer.groupId}/wall/${post.id}`;
  const canDelete = !viewer.archived && (post.isMine || viewer.isAdmin);
  const canEdit = !viewer.archived && post.isMine && post.kind !== "milestone";
  const canPin = !viewer.archived && viewer.isAdmin && post.kind === "announcement";
  const canReport = !post.isMine;
  const canBlock = !post.isMine && Boolean(post.author.userId);

  return (
    <article className={cn("ui-card wall-post", `wall-post--${post.kind}`)} aria-labelledby={headingId}>
      <header className="wall-post__head">
        <Avatar
          name={authorName(post.author, name)}
          size="sm"
          decorative
          src={post.author.userId ? avatarUrl(post.author.userId, post.author.avatarPath, "sm") : undefined}
        />
        <div className="wall-post__who">
          <Heading id={headingId} className="wall-post__by">
            {name}
            <span className="wall-kind">{t(`kinds.${post.kind}`)}</span>
            {post.pinned ? (
              <span className="wall-kind wall-kind--pinned">
                <Pin aria-hidden="true" />
                {t("post.pinned")}
              </span>
            ) : null}
          </Heading>
          <p className="wall-post__when text-muted">
            <When iso={post.createdAt} timeZone={viewer.timeZone} />
            {post.editedAt ? <> · {t("post.edited")}</> : null}
          </p>
        </div>
      </header>
      {post.kind === "milestone" ? (
        <p className="wall-post__body wall-milestone">
          <Sparkles aria-hidden="true" className="inline-icon" />{" "}
          {await postText(post, authorName(post.author, t("post.formerMember")))}
        </p>
      ) : (
        <p className="wall-post__body">{post.body}</p>
      )}
      <Reactions
        viewer={viewer}
        targetType="post"
        target={post.id}
        postId={post.id}
        reactions={post.reactions}
        from={from}
        prayerRequest={post.kind === "prayer_request"}
      />
      <div className="wall-post__foot">
        {from !== "post" ? (
          <Link href={postHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <span aria-hidden="true">{t("post.comments", { count: post.commentCount })}</span>
            <span className="visually-hidden">{t("post.commentsFor", { count: post.commentCount })}</span>
          </Link>
        ) : null}
        {canEdit || canDelete || canPin || canReport || canBlock ? (
          <div className="wall-post__actions" role="group" aria-label={t("post.actionsFor")}>
            {canEdit ? (
              <details className="group-confirm wall-edit">
                <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("form.edit")}</summary>
                <div className="group-confirm__body wall-edit__body">
                  <EditTextForm target="post" id={post.id} body={post.body} />
                </div>
              </details>
            ) : null}
            {canPin ? (
              <form action={pinPostAction.bind(null, viewer.groupId, post.id)}>
                <input type="hidden" name="pinned" value={post.pinned ? "0" : "1"} />
                <input type="hidden" name="from" value={from} />
                <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {post.pinned ? t("manage.unpin") : t("manage.pin")}
                </button>
              </form>
            ) : null}
            {canDelete ? (
              <DeleteControl
                action={deletePostAction.bind(null, viewer.groupId, post.id)}
                mine={post.isMine}
                from={from}
              />
            ) : null}
            {canReport ? (
              <ReportControl viewer={viewer} targetType="post" target={post.id} postId={post.id} from={from} />
            ) : null}
            {canBlock && post.author.userId ? (
              <BlockControl viewer={viewer} userId={post.author.userId} name={post.author.name ?? ""} from="wall" />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** The wall page's list: pinned announcements first (first page only), then posts, then "older". */
export async function WallList({ viewer, page, filter }: { viewer: WallViewer; page: WallPage; filter: WallFilter }) {
  const t = await getTranslations("social.wall");
  const base = `/groups/${viewer.groupId}/wall${filter === "all" ? "" : `?kind=${filter}`}`;
  return (
    <div className="stack">
      {page.pinned.length ? (
        <section aria-labelledby="wall-pinned" className="wall-section">
          <h2 id="wall-pinned" className="profile-section__title">
            {t("pinnedTitle")}
          </h2>
          <ul className="wall-list">
            {page.pinned.map((p) => (
              <li key={p.id}>
                <PostCard viewer={viewer} post={p} from="wall" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="wall-posts" className="wall-section">
        <h2 id="wall-posts" className="profile-section__title">
          {t("postsTitle")}
        </h2>
        {page.posts.length ? (
          <ul className="wall-list" data-testid="wall-list">
            {page.posts.map((p) => (
              <li key={p.id}>
                <PostCard viewer={viewer} post={p} from="wall" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{filter === "all" ? t("empty") : t("emptyFiltered")}</p>
        )}
        {page.nextBefore ? (
          <p>
            <Link
              href={`${base}${base.includes("?") ? "&" : "?"}before=${page.nextBefore}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("older")}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** A post's comments, oldest first, with the form to add one. */
export async function CommentList({
  viewer,
  postId,
  comments,
  composer,
}: {
  viewer: WallViewer;
  postId: string;
  comments: WallComment[];
  composer: ReactNode;
}) {
  const t = await getTranslations("social");
  return (
    <section className="wall-section" aria-labelledby="comments-title">
      <h2 id="comments-title" className="profile-section__title">
        {t("post.comments", { count: comments.length })}
      </h2>
      {comments.length ? (
        <ul className="wall-comments" data-testid="comment-list">
          {comments.map((c) => {
            const name = c.isMine ? t("post.you") : authorName(c.author, t("post.formerMember"));
            const headingId = `comment-${c.id}-by`;
            const canDelete = !viewer.archived && (c.isMine || viewer.isAdmin);
            const canEdit = !viewer.archived && c.isMine;
            return (
              <li key={c.id}>
                <article className="wall-comment" aria-labelledby={headingId}>
                  <header className="wall-post__head">
                    <Avatar
                      name={authorName(c.author, name)}
                      size="sm"
                      decorative
                      src={c.author.userId ? avatarUrl(c.author.userId, c.author.avatarPath, "sm") : undefined}
                    />
                    <div className="wall-post__who">
                      <h3 id={headingId} className="wall-post__by">
                        {name}
                      </h3>
                      <p className="wall-post__when text-muted">
                        <When iso={c.createdAt} timeZone={viewer.timeZone} />
                        {c.editedAt ? <> · {t("post.edited")}</> : null}
                      </p>
                    </div>
                  </header>
                  <p className="wall-post__body">{c.body}</p>
                  <Reactions
                    viewer={viewer}
                    targetType="comment"
                    target={c.id}
                    postId={postId}
                    reactions={c.reactions}
                    from="post"
                  />
                  <div className="wall-post__actions" role="group" aria-label={t("post.commentActionsFor")}>
                    {canEdit ? (
                      <details className="group-confirm wall-edit">
                        <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("form.edit")}</summary>
                        <div className="group-confirm__body wall-edit__body">
                          <EditTextForm target="comment" id={c.id} body={c.body} />
                        </div>
                      </details>
                    ) : null}
                    {canDelete ? (
                      <DeleteControl
                        action={deleteCommentAction.bind(null, viewer.groupId, postId, c.id)}
                        mine={c.isMine}
                      />
                    ) : null}
                    {!c.isMine ? (
                      <ReportControl viewer={viewer} targetType="comment" target={c.id} postId={postId} from="post" />
                    ) : null}
                    {!c.isMine && c.author.userId ? (
                      <BlockControl viewer={viewer} userId={c.author.userId} name={c.author.name ?? ""} from="wall" />
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
      {composer}
    </section>
  );
}

/** Cut a long post for the home card at a character boundary (never mid-emoji). */
function preview(text: string, max = 280): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max).join("").trimEnd()}…`;
}

/** The group home's wall card: pinned and newest posts, linking to the wall. */
export async function WallHomeCard({ viewer, page }: { viewer: WallViewer; page: WallPage }) {
  const t = await getTranslations("social");
  const posts = [...page.pinned, ...page.posts].slice(0, SOCIAL_LIMITS.homePreview);
  const texts = await Promise.all(posts.map((p) => postText(p, authorName(p.author, t("post.formerMember")))));
  return (
    <section className="ui-card wall-home" aria-labelledby="home-wall">
      <h2 id="home-wall" className="ui-card__title">
        {t("wall.homeTitle")}
      </h2>
      {posts.length ? (
        <ul className="wall-home__list">
          {posts.map((p, i) => (
            <li key={p.id} className="wall-home__item">
              <p className="wall-home__by">
                <span>{p.isMine ? t("post.you") : authorName(p.author, t("post.formerMember"))}</span>
                <span className="wall-kind">{t(`kinds.${p.kind}`)}</span>
                {p.pinned ? <span className="wall-kind wall-kind--pinned">{t("post.pinned")}</span> : null}
              </p>
              <p className="wall-post__body">
                <Link href={`/groups/${viewer.groupId}/wall/${p.id}`} className="wall-home__link">
                  {preview(texts[i] ?? "")}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">{t("wall.homeEmpty")}</p>
      )}
      <p className="wall-home__more">
        <Link href={`/groups/${viewer.groupId}/wall`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {viewer.archived ? t("wall.homeOpen") : t("wall.homeWrite")}
        </Link>
      </p>
    </section>
  );
}

/** Settings → Blocked people. */
export async function BlockedList({ people, timeZone }: { people: BlockedPerson[]; timeZone: string }) {
  const t = await getTranslations("social.block");
  const format = await getFormatter();
  if (!people.length) return <p className="text-muted">{t("listEmpty")}</p>;
  return (
    <ul className="group-list" data-testid="blocked-list">
      {people.map((p) => (
        <li key={p.userId} className="group-row">
          <div className="group-row__main">
            <span className="group-row__title">{p.name}</span>
            <span className="text-muted">
              {t("since", { date: format.dateTime(new Date(p.blockedAt), { dateStyle: "medium", timeZone }) })}
            </span>
          </div>
          <div className="group-row__actions">
            <form action={unblockAction}>
              <input type="hidden" name="userId" value={p.userId} />
              <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                {t("unblock", { name: p.name })}
              </button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A group's open reports, for its admins (D-079). */
export async function ModerationList({ viewer, reports }: { viewer: WallViewer; reports: OpenReport[] }) {
  const t = await getTranslations("social");
  const format = await getFormatter();
  if (!reports.length) return <p className="text-muted">{t("moderation.empty")}</p>;
  return (
    <ul className="wall-list" data-testid="report-list">
      {reports.map((r) => {
        const name = authorName(r.subject, t("moderation.someone"));
        const headingId = `report-${r.id}`;
        return (
          <li key={r.id}>
            <article className="ui-card wall-post" aria-labelledby={headingId}>
              <h2 id={headingId} className="wall-post__by">
                {t(`moderation.about.${r.targetType}`, { name })}
              </h2>
              <p className="text-muted">
                {t("moderation.reportedOn", {
                  date: format.dateTime(new Date(r.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: viewer.timeZone,
                  }),
                })}
                {" · "}
                {t("moderation.count", { count: r.reportsOnTarget })}
              </p>
              <p>
                {t("moderation.reason", { reason: t(`report.reasons.${r.reason as (typeof REPORT_REASONS)[number]}`) })}
              </p>
              {r.note ? <p className="wall-post__body">{t("moderation.note", { note: r.note })}</p> : null}
              {r.snapshot ? (
                <blockquote className="wall-report__snapshot wall-post__body">{r.snapshot}</blockquote>
              ) : null}
              {!r.stillThere && r.targetType !== "member" ? <p className="text-muted">{t("moderation.gone")}</p> : null}
              <div className="wall-post__actions" role="group" aria-label={t("post.actionsFor")}>
                {r.postId && r.stillThere ? (
                  <Link
                    href={`/groups/${viewer.groupId}/wall/${r.postId}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    {t("moderation.view")}
                  </Link>
                ) : null}
                {r.targetType === "post" && r.stillThere ? (
                  <DeleteControl
                    action={deletePostAction.bind(null, viewer.groupId, r.targetId)}
                    mine={false}
                    from="moderation"
                  />
                ) : null}
                {r.targetType === "comment" && r.postId && r.stillThere ? (
                  <DeleteControl
                    action={deleteCommentAction.bind(null, viewer.groupId, r.postId, r.targetId)}
                    mine={false}
                  />
                ) : null}
                <form action={resolveReportAction.bind(null, viewer.groupId)}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="outcome" value="actioned" />
                  <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    {t("moderation.actioned")}
                  </button>
                </form>
                <form action={resolveReportAction.bind(null, viewer.groupId)}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="outcome" value="dismissed" />
                  <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    {t("moderation.dismiss")}
                  </button>
                </form>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/** The five reactions on a member's check-in in the Today panel (D-087). */
export async function CheckinReactions({
  groupId,
  checkinId,
  name,
  reactions,
}: {
  groupId: string;
  checkinId: string;
  name: string;
  reactions: ReactionCount[];
}) {
  const t = await getTranslations();
  return (
    <form action={reactCheckinAction.bind(null, groupId)} className="wall-reactions checkin-reactions">
      <input type="hidden" name="checkinId" value={checkinId} />
      <ul className="ui-reactions" aria-label={t("social.reactions.checkinLabel", { name })}>
        {REACTION_KINDS.map((kind) => {
          const r = reactions.find((x) => x.kind === kind) ?? { kind, count: 0, mine: false };
          const Icon = icons[kind];
          const label = t(`ui.reactions.kinds.${kind}`);
          return (
            <li key={kind}>
              <button
                type="submit"
                name="reaction"
                value={`${kind}:${r.mine ? 0 : 1}`}
                className="ui-reaction"
                aria-pressed={r.mine}
              >
                <Icon aria-hidden="true" />
                <span aria-hidden="true">{r.count}</span>
                <span className="visually-hidden">
                  {r.mine
                    ? t("social.reactions.remove", { reaction: label, count: r.count })
                    : t("social.reactions.add", { reaction: label, count: r.count })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
