import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface ProgressRingProps {
  value: number;
  max: number;
  /** Accessible name, e.g. "Progress to next level". */
  label: string;
  /** Spoken value, e.g. "3 of 10 days". */
  valueText: string;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children?: ReactNode;
  className?: string;
}

export function ringOffset(value: number, max: number): number {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return CIRCUMFERENCE * (1 - ratio);
}

export function ProgressRing({
  value,
  max,
  label,
  valueText,
  size = "md",
  loading = false,
  children,
  className,
}: ProgressRingProps) {
  return (
    <div
      className={cn("ui-ring", `ui-ring--${size}`, className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={loading ? undefined : Math.min(Math.max(value, 0), max)}
      aria-valuetext={loading ? undefined : valueText}
      aria-busy={loading || undefined}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="ui-ring__track" cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" />
        {loading ? null : (
          <circle
            className="ui-ring__value"
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={ringOffset(value, max)}
          />
        )}
      </svg>
      <div className="ui-ring__label" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
