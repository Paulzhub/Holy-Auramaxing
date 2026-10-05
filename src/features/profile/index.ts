/**
 * profile module — onboarding, profile, avatar pipeline and privacy settings
 * (CLAUDE.md §7.2, §7.3). Phase 2.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/profile"     server code and server components (this file)
 *   "@/features/profile/ui"  client components
 */
export { onboardingSteps, parseStep, type OnboardingStep } from "./onboarding";
export { FinishOnboardingButton, SkipSetupButton } from "./components/finish-onboarding";
