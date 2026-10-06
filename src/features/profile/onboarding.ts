import { z } from "zod";

import { DISPLAY_NAME_MAX, MY_WHY_MAX } from "./limits";

/** The onboarding steps, in order (CLAUDE.md §7.2). Every step can be skipped. */
export const onboardingSteps = ["welcome", "why", "reminder", "discreet", "group"] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

export function parseStep(value: string | string[] | undefined): OnboardingStep {
  const v = Array.isArray(value) ? value[0] : value;
  return (onboardingSteps as readonly string[]).includes(v ?? "") ? (v as OnboardingStep) : "welcome";
}

export function nextStep(step: OnboardingStep): OnboardingStep | undefined {
  return onboardingSteps[onboardingSteps.indexOf(step) + 1];
}

export { DISPLAY_NAME_MAX, MY_WHY_MAX } from "./limits";

// Messages are keys under "onboarding.errors".
// Display names allow any script; control characters are refused.
export const displayNameSchema = z
  .string()
  .trim()
  .max(DISPLAY_NAME_MAX, { error: "nameTooLong" })
  .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), { error: "nameInvalid" });

export const myWhySchema = z.string().trim().max(MY_WHY_MAX, { error: "whyTooLong" });

export const reminderSchema = z.object({
  // "" means no reminder.
  reminderTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "timeInvalid" })]),
  timezone: z.string().min(1).max(64),
});

export type OnboardingErrorKey =
  "nameTooLong" | "nameInvalid" | "whyTooLong" | "timeInvalid" | "timezoneInvalid" | "saveFailed";

export interface OnboardingFormState {
  error?: OnboardingErrorKey;
}
