import type { Trigger } from "../constants";

/**
 * Small, server-rendered SVG charts for the progress page (CLAUDE.md §7.5).
 * No chart library and no JavaScript: one series per chart (mood and urges
 * are separate small multiples, never two scales on one axis), thin 2px
 * lines, 8px markers with a native tooltip, a recessive grid, and a table
 * with the same numbers next to them. Colours come from the theme tokens,
 * so dark mode is handled by CSS.
 */

export interface SeriesPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number | null;
}

const WIDTH = 320;
const HEIGHT = 132;
const PAD = { top: 10, right: 10, bottom: 22, left: 22 };

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Splits points into runs of consecutive days, so missed days break the line. */
export function lineSegments(points: SeriesPoint[]): SeriesPoint[][] {
  const segments: SeriesPoint[][] = [];
  let current: SeriesPoint[] = [];
  let previous: string | null = null;
  for (const p of points) {
    if (p.value === null) continue;
    if (previous && daysBetween(previous, p.date) !== 1) {
      segments.push(current);
      current = [];
    }
    current.push(p);
    previous = p.date;
  }
  if (current.length) segments.push(current);
  return segments;
}

export function SeriesChart({
  id,
  title,
  points,
  from,
  to,
  min,
  max,
  tone,
  pointLabel,
  axisStart,
  axisEnd,
}: {
  id: string;
  title: string;
  points: SeriesPoint[];
  from: string;
  to: string;
  min: number;
  max: number;
  tone: "mood" | "urge";
  /** The tooltip for one point, e.g. "3 Oct: Good (4)". */
  pointLabel: (point: SeriesPoint) => string;
  axisStart: string;
  axisEnd: string;
}) {
  const span = Math.max(daysBetween(from, to), 1);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (date: string) => PAD.left + (daysBetween(from, date) / span) * plotW;
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * plotH;
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const shown = points.filter((p) => p.value !== null);

  return (
    <figure className={`series-chart series-chart--${tone}`} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="series-chart__title">
        {title}
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={`${id}-title`} focusable="false">
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="series-chart__grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="series-chart__tick" x={PAD.left - 6} y={y(tick)} dy="0.32em" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        <text className="series-chart__tick" x={PAD.left} y={HEIGHT - 4}>
          {axisStart}
        </text>
        <text className="series-chart__tick" x={WIDTH - PAD.right} y={HEIGHT - 4} textAnchor="end">
          {axisEnd}
        </text>
        {lineSegments(points).map((segment) =>
          segment.length > 1 ? (
            <polyline
              key={segment[0]?.date}
              className="series-chart__line"
              points={segment.map((p) => `${x(p.date).toFixed(1)},${y(p.value as number).toFixed(1)}`).join(" ")}
            />
          ) : null,
        )}
        {shown.map((p) => (
          <circle key={p.date} className="series-chart__dot" cx={x(p.date)} cy={y(p.value as number)} r={4}>
            <title>{pointLabel(p)}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

/** Horizontal bars, one per trigger, each labelled with its count (no colour needed to read it). */
export function TriggerBars({
  rows,
  label,
  countLabel,
}: {
  rows: { trigger: Trigger; count: number }[];
  label: (trigger: Trigger) => string;
  countLabel: (count: number) => string;
}) {
  const top = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="trigger-bars">
      {rows.map((row) => (
        <li key={row.trigger} className="trigger-bars__row">
          <span className="trigger-bars__label">{label(row.trigger)}</span>
          {/* An SVG width, not an inline style: the CSP allows no style attributes (D-007). */}
          <svg className="trigger-bars__track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
            <rect
              className="trigger-bars__bar"
              x="0"
              y="0"
              height="10"
              rx="2"
              width={row.count === 0 ? 0 : Math.max((row.count / top) * 100, 3)}
            />
          </svg>
          <span className="trigger-bars__count">{countLabel(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}
