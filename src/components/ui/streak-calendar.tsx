import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

import { buildMonthGrid, weekdayReferenceDates, type DayStatus } from "./calendar-grid";

export interface StreakCalendarProps {
  year: number;
  /** 1–12 */
  month: number;
  /** Status per ISO date. Past dates missing from the map count as "none". */
  days: Record<string, DayStatus>;
  /** ISO date for "today" in the user's own time zone. */
  today: string;
  locale: string;
  weekStartsOn?: 0 | 1;
  showLegend?: boolean;
}

/**
 * A private month view. A slip is a soft ring, never red, and a missed day
 * is "no check-in", never a slip. Status is conveyed by shape and text, not
 * colour alone.
 */
export function StreakCalendar({
  year,
  month,
  days,
  today,
  locale,
  weekStartsOn = 1,
  showLegend = true,
}: StreakCalendarProps) {
  const t = useTranslations("ui.calendar");
  const weeks = buildMonthGrid(year, month, weekStartsOn);
  const utc = { timeZone: "UTC" } as const;
  const monthName = new Intl.DateTimeFormat(locale, { ...utc, month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  const shortDay = new Intl.DateTimeFormat(locale, { ...utc, weekday: "short" });
  const longDay = new Intl.DateTimeFormat(locale, { ...utc, weekday: "long" });
  const fullDate = new Intl.DateTimeFormat(locale, { ...utc, day: "numeric", month: "long" });

  function statusFor(date: string): DayStatus | "future" {
    if (date > today) return "future";
    return days[date] ?? "none";
  }

  return (
    <div>
      <table className="ui-calendar">
        <caption>{monthName}</caption>
        <thead>
          <tr>
            {weekdayReferenceDates(weekStartsOn).map((date) => (
              <th scope="col" key={date.toISOString()}>
                <span aria-hidden="true">{shortDay.format(date)}</span>
                <span className="visually-hidden">{longDay.format(date)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((cell, c) => {
                if (!cell.date || cell.day === null) return <td key={c} />;
                const status = statusFor(cell.date);
                const isToday = cell.date === today;
                const [y, m, d] = cell.date.split("-").map(Number) as [number, number, number];
                return (
                  <td key={c}>
                    <span
                      className={cn("ui-day", `ui-day--${status}`, isToday && "ui-day--today")}
                      aria-current={isToday ? "date" : undefined}
                    >
                      <span aria-hidden="true">{cell.day}</span>
                      <span className="visually-hidden">
                        {t("cellLabel", {
                          date: fullDate.format(new Date(Date.UTC(y, m - 1, d))),
                          status: t(`status.${status}`),
                        })}
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {showLegend ? (
        <ul className="ui-calendar-legend" aria-label={t("legend")}>
          {(["clean", "slipped", "none"] as const).map((status) => (
            <li key={status}>
              <span className={cn("ui-day", `ui-day--${status}`)} aria-hidden="true" />
              {t(`status.${status}`)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
