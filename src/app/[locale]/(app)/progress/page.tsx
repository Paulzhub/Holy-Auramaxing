import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { StreakCalendar } from "@/components/ui/streak-calendar";
import type { DayStatus } from "@/components/ui/calendar-grid";
import { requireAccount } from "@/features/auth";
import {
  buildInsights,
  CHART_RANGES,
  getCheckinHistory,
  getCheckinOverview,
  InsightList,
  KeptMessage,
  SeriesChart,
  StreakStats,
  TriggerBars,
  triggerCounts,
  type ChartRange,
  type SeriesPoint,
} from "@/features/checkins";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("progress") };
}

type SearchParams = Promise<{ month?: string; range?: string }>;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "Your journey" (CLAUDE.md §7.5): a private calendar, mood and urge charts,
 * triggers and plain-language insights. Only the person can open it; every
 * read goes through RLS as them.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId }, overview, query, t, tTrig, tForm, format, locale] = await Promise.all([
    requireAccount(),
    getCheckinOverview(),
    searchParams,
    getTranslations("checkins.progress"),
    getTranslations("checkins.triggers"),
    getTranslations("checkins.form"),
    getFormatter(),
    getLocale(),
  ]);

  // Which month: ?month=YYYY-MM, no later than this month and at most two years back.
  const [ty, tm] = overview.today.split("-").map(Number) as [number, number];
  const asked = /^(\d{4})-(\d{2})$/.exec(query.month ?? "");
  let year = asked ? Number(asked[1]) : ty;
  let month = asked ? Number(asked[2]) : tm;
  const monthIndex = (y: number, m: number) => y * 12 + m - 1;
  if (month < 1 || month > 12 || monthIndex(year, month) > monthIndex(ty, tm)) [year, month] = [ty, tm];
  if (monthIndex(year, month) < monthIndex(ty, tm) - 24) ({ year, month } = shiftMonth(ty, tm, -24));
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const hasPrev = monthIndex(prev.year, prev.month) >= monthIndex(ty, tm) - 24;
  const hasNext = monthIndex(next.year, next.month) <= monthIndex(ty, tm);

  const range: ChartRange = (CHART_RANGES as readonly number[]).includes(Number(query.range))
    ? (Number(query.range) as ChartRange)
    : 30;
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = addDays(`${next.year}-${pad(next.month)}-01`, -1);
  const rangeStart = addDays(overview.today, -(range - 1));

  // One read covers both the calendar month and the chart period.
  const from = monthStart < rangeStart ? monthStart : rangeStart;
  const to = monthEnd > overview.today ? overview.today : monthEnd;
  const history = await getCheckinHistory(userId, from, to > overview.today ? to : overview.today);

  const days: Record<string, DayStatus> = {};
  for (const d of history) if (d.date >= monthStart && d.date <= monthEnd) days[d.date] = d.outcome;
  const recent = history.filter((d) => d.date >= rangeStart);

  const byDate = new Map(recent.map((d) => [d.date, d]));
  const series = (pick: (d: (typeof recent)[number]) => number | null): SeriesPoint[] =>
    Array.from({ length: range }, (_, i) => {
      const date = addDays(rangeStart, i);
      const record = byDate.get(date);
      return { date, value: record ? pick(record) : null };
    });
  const mood = series((d) => d.mood);
  const urge = series((d) => d.urge);
  const hasChartData = recent.some((d) => d.mood !== null || d.urge !== null);
  const shortDay = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { timeZone: "UTC", day: "numeric", month: "short" });
  const counts = triggerCounts(recent);
  const monthHref = (y: number, m: number) => `/progress?month=${y}-${pad(m)}&range=${range}`;

  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <div className="stack progress-page">
        <StreakStats overview={overview} />
        {overview.currentStreak === 0 ? (
          <KeptMessage
            overview={overview}
            reason={overview.answered[overview.today] === "slipped" ? "slip" : "paused"}
          />
        ) : null}

        <section className="ui-card" aria-labelledby="calendar-title">
          <h2 id="calendar-title" className="ui-card__title">
            {t("calendarTitle")}
          </h2>
          <nav className="month-nav" aria-label={t("monthNav")}>
            {hasPrev ? (
              <Link href={monthHref(prev.year, prev.month)} className="month-nav__link" rel="prev">
                <ChevronLeft aria-hidden="true" /> <span>{t("prevMonth")}</span>
              </Link>
            ) : (
              <span />
            )}
            {hasNext ? (
              <Link href={monthHref(next.year, next.month)} className="month-nav__link" rel="next">
                <span>{t("nextMonth")}</span> <ChevronRight aria-hidden="true" />
              </Link>
            ) : null}
          </nav>
          <StreakCalendar year={year} month={month} days={days} today={overview.today} locale={locale} />
        </section>

        <section className="ui-card" aria-labelledby="charts-title">
          <h2 id="charts-title" className="ui-card__title">
            {t("chartsTitle")}
          </h2>
          <nav className="range-nav" aria-label={t("rangeLabel")}>
            {CHART_RANGES.map((r) => (
              <Link
                key={r}
                href={`/progress?month=${year}-${pad(month)}&range=${r}`}
                className="range-nav__link"
                aria-current={r === range ? "page" : undefined}
              >
                {t("range", { days: r })}
              </Link>
            ))}
          </nav>
          {hasChartData ? (
            <>
              <p className="visually-hidden">{t("chartAlt", { days: range })}</p>
              <div className="series-charts">
                <SeriesChart
                  id="chart-mood"
                  title={t("moodSeries")}
                  points={mood}
                  from={rangeStart}
                  to={overview.today}
                  min={1}
                  max={5}
                  tone="mood"
                  axisStart={shortDay(rangeStart)}
                  axisEnd={shortDay(overview.today)}
                  pointLabel={(p) =>
                    `${shortDay(p.date)}: ${tForm(`mood.${p.value as 1 | 2 | 3 | 4 | 5}`)} (${p.value})`
                  }
                />
                <SeriesChart
                  id="chart-urge"
                  title={t("urgeSeries")}
                  points={urge}
                  from={rangeStart}
                  to={overview.today}
                  min={0}
                  max={5}
                  tone="urge"
                  axisStart={shortDay(rangeStart)}
                  axisEnd={shortDay(overview.today)}
                  pointLabel={(p) =>
                    `${shortDay(p.date)}: ${tForm(`urge.${p.value as 0 | 1 | 2 | 3 | 4 | 5}`)} (${p.value})`
                  }
                />
              </div>
              <details className="chart-table">
                <summary>{t("tableSummary")}</summary>
                <table className="data-table">
                  <caption className="visually-hidden">{t("tableCaption")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("dayColumn")}</th>
                      <th scope="col">{t("moodSeries")}</th>
                      <th scope="col">{t("urgeSeries")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent
                      .filter((d) => d.mood !== null || d.urge !== null)
                      .map((d) => (
                        <tr key={d.date}>
                          <th scope="row">{shortDay(d.date)}</th>
                          <td>{d.mood ?? t("noValue")}</td>
                          <td>{d.urge ?? t("noValue")}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="text-muted">{t("chartEmpty")}</p>
          )}
        </section>

        <section className="ui-card" aria-labelledby="triggers-title">
          <h2 id="triggers-title" className="ui-card__title">
            {t("triggersTitle")}
          </h2>
          {counts.some((c) => c.count > 0) ? (
            <TriggerBars rows={counts} label={(k) => tTrig(k)} countLabel={(n) => t("times", { count: n })} />
          ) : (
            <p className="text-muted">{t("triggersEmpty")}</p>
          )}
        </section>

        <section className="ui-card" aria-labelledby="insights-title">
          <h2 id="insights-title" className="ui-card__title">
            {t("insightsTitle")}
          </h2>
          <InsightList insights={buildInsights(recent)} />
        </section>
      </div>
    </>
  );
}
