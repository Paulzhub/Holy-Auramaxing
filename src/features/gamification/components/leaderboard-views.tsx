import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LeaderboardRow } from "@/components/ui/leaderboard-row";
import { avatarUrl } from "@/features/profile";
import { Link } from "@/i18n/navigation";

import {
  BOARDS,
  PAGE_SIZE,
  boardHasWeek,
  boardHref,
  boardShowsEveryone,
  goalPercent,
  type Board,
  type Period,
} from "../leaderboards";
import type { BoardPage, BoardRow, Together } from "../server/leaderboards";

/**
 * Leaderboards, the Together total and the group goal (CLAUDE.md §7.6,
 * D-074, D-075). Server components: tabs and "show more" are links, so no
 * JavaScript reaches the browser.
 */

async function Rows({ rows, board }: { rows: BoardRow[]; board: Board }) {
  const t = await getTranslations("leaderboard");
  return (
    <>
      {rows.map((r) => {
        // Owners and admins get a hidden member's id (D-088); members never do.
        const shown = r.isMe || !r.hidden || Boolean(r.userId);
        return (
          <LeaderboardRow
            key={`${r.place}`}
            rank={r.place}
            // Your own row shows your name even when you're hidden; you see the note below.
            name={r.isMe ? r.name || t("you") : r.name || t("someone")}
            hidden={!shown}
            note={r.hidden && !r.isMe && shown ? t("hiddenFromMembers") : undefined}
            isMe={r.isMe}
            avatarSrc={r.userId && shown ? avatarUrl(r.userId, r.avatarPath, "md") : undefined}
            value={t(`score.${board}`, { count: r.score })}
          />
        );
      })}
    </>
  );
}

/** The full board page: board tabs, this week / all time, a page of places, and my own place. */
export async function LeaderboardBoard({
  groupId,
  board,
  period,
  after,
  page,
}: {
  groupId: string;
  board: Board;
  period: Period;
  after: number;
  page: BoardPage;
}) {
  const t = await getTranslations("leaderboard");
  const meHidden = [...page.rows, ...(page.me ? [page.me] : [])].some((r) => r.isMe && r.hidden);
  const iAmOnBoard = page.me !== null || page.rows.some((r) => r.isMe);

  return (
    <div className="stack">
      <nav className="lb-tabs" aria-label={t("boardsLabel")}>
        <ul>
          {BOARDS.map((b) => (
            <li key={b}>
              <Link
                href={boardHref(groupId, b, boardHasWeek(b) ? period : "all")}
                className="lb-tabs__link"
                aria-current={b === board ? "page" : undefined}
              >
                {t(`boards.${b}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="ui-card lb-board" aria-labelledby="lb-board-title">
        <div className="lb-board__head">
          <h2 id="lb-board-title" className="ui-card__title">
            {t(`boards.${board}`)}
            {boardHasWeek(board) ? (
              <span className="visually-hidden">{t("periodSuffix", { period: t(`periods.${period}`) })}</span>
            ) : null}
          </h2>
          {boardHasWeek(board) ? (
            <nav className="lb-periods" aria-label={t("periodsLabel")}>
              <ul>
                {(["week", "all"] as const).map((p) => (
                  <li key={p}>
                    <Link
                      href={boardHref(groupId, board, p)}
                      className="lb-periods__link"
                      aria-current={p === period ? "page" : undefined}
                    >
                      {t(`periods.${p}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
        <p className="text-muted lb-board__hint">{t(`hints.${board}`)}</p>

        {page.rows.length ? (
          <ol className="ui-leaderboard" data-testid="leaderboard">
            <Rows rows={page.rows} board={board} />
          </ol>
        ) : (
          <p className="text-muted">{t("empty")}</p>
        )}

        {page.me ? (
          <div className="lb-me">
            <h3 className="lb-me__title">{t("yourPlace")}</h3>
            <ol className="ui-leaderboard" data-testid="leaderboard-me">
              <Rows rows={[page.me]} board={board} />
            </ol>
          </div>
        ) : null}

        {page.hasMore || after > 0 ? (
          <p className="lb-more">
            {after > 0 ? <Link href={boardHref(groupId, board, period)}>{t("backToTop")}</Link> : null}
            {page.hasMore ? (
              <Link href={boardHref(groupId, board, period, after + PAGE_SIZE)}>
                {t("showMore", { count: PAGE_SIZE })}
              </Link>
            ) : null}
          </p>
        ) : null}

        <div className="lb-notes text-muted">
          {meHidden ? <p>{t("hiddenNote")}</p> : null}
          {!boardShowsEveryone(board) ? <p>{t("shareNote")}</p> : null}
          {!boardShowsEveryone(board) && !iAmOnBoard ? <p>{t("notOnBoard")}</p> : null}
          {period === "week" ? <p>{t("weekNote")}</p> : null}
          <p>{t("updatedNote")}</p>
        </div>
      </section>
    </div>
  );
}

/** The group home's leaderboard card: the top of Consistency XP, and my place. */
export async function LeaderboardPreview({ groupId, page }: { groupId: string; page: BoardPage }) {
  const t = await getTranslations("leaderboard");
  return (
    <section className="ui-card lb-preview" aria-labelledby="home-leaderboard">
      <h2 id="home-leaderboard" className="ui-card__title">
        {t("title")}
      </h2>
      <p className="text-muted">{t("previewLede")}</p>
      {page.rows.length ? (
        <ol className="ui-leaderboard" data-testid="leaderboard-preview">
          <Rows rows={page.me ? [...page.rows, page.me] : page.rows} board="xp" />
        </ol>
      ) : (
        <p className="text-muted">{t("empty")}</p>
      )}
      <p>
        <Link href={boardHref(groupId, "xp")}>{t("seeAll")}</Link>
      </p>
    </section>
  );
}

/** The goal's progress bar: an SVG (the CSP blocks inline styles), with the same numbers as text. */
function GoalBar({ percent }: { percent: number }) {
  return (
    <svg className="goal-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="goal-bar__track" x="0" y="0" width="100" height="8" rx="4" />
      {percent > 0 ? <rect className="goal-bar__fill" x="0" y="0" width={percent} height="8" rx="4" /> : null}
    </svg>
  );
}

/**
 * The group's free days together and its goal (D-075). Only members who
 * share their streak or more are counted, so a quiet member's answer never
 * moves the number (D-044). `children`: the goal form, for admins.
 */
export async function TogetherCard({ together, children }: { together: Together; children?: ReactNode }) {
  const t = await getTranslations("leaderboard.together");
  const format = await getFormatter();
  const { goal } = together;
  const percent = goal ? goalPercent(goal.progress, goal.target) : 0;
  const day = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <section className="ui-card together-card" aria-labelledby="home-together">
      <h2 id="home-together" className="ui-card__title">
        {t("title")}
      </h2>
      <p className="together-card__total" data-testid="together-total">
        {t("total", { count: together.freeDays })}
      </p>
      <p className="text-muted">
        {together.membersCounted === together.membersTotal
          ? t("countedAll")
          : t("counted", { counted: together.membersCounted, total: together.membersTotal })}
      </p>

      <div className="together-card__goal">
        <h3 className="together-card__goal-title">{t("goalTitle")}</h3>
        {goal ? (
          <>
            <p data-testid="goal-progress">
              {t("goalText", { progress: goal.progress, target: goal.target, period: goal.period })}
            </p>
            <GoalBar percent={percent} />
            <p className="text-muted">
              {percent >= 100 ? t("goalReached") : t("goalPercent", { percent })}
              {" · "}
              {t("goalDates", { from: day(goal.startsOn), to: day(goal.endsOn) })}
            </p>
          </>
        ) : (
          <p className="text-muted">{t("goalNone")}</p>
        )}
        {children}
      </div>
    </section>
  );
}
