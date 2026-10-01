import { cn } from "@/lib/cn";

/**
 * Decorative placeholder. Wrap loading regions in an element with
 * aria-busy="true" and a visually hidden "Loading…" message.
 */
export function Skeleton({ className, shape = "rect" }: { className?: string; shape?: "rect" | "circle" }) {
  return (
    <span className={cn("ui-skeleton", shape === "circle" && "ui-skeleton--circle", className)} aria-hidden="true" />
  );
}
