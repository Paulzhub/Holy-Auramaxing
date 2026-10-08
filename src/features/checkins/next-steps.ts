/** The suggested next steps after a slip (§7.5), in rotation. */
export const NEXT_STEPS = ["breathe", "walk", "verse", "message"] as const;
export type NextStepKey = (typeof NEXT_STEPS)[number];

/** One suggested next step, varied by day so it doesn't feel canned. */
export function nextStepFor(date: string): NextStepKey {
  const day = Number(date.replaceAll("-", "")) || 0;
  return NEXT_STEPS[day % NEXT_STEPS.length] ?? "breathe";
}
