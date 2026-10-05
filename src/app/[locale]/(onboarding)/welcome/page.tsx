import { Heart, Lock, Moon, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthHeading, requireAccount } from "@/features/auth";
import { FinishOnboardingButton, onboardingSteps, parseStep } from "@/features/profile";
import { DiscreetForm, ReminderForm, SkipStepLink, WelcomeForm, WhyForm } from "@/features/profile/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("welcome") };
}

/** Every zone the runtime knows, plus UTC and the person's current zone, so the list always shows their real setting. */
function timezoneOptions(current: string): string[] {
  return [...new Set([...Intl.supportedValuesOf("timeZone"), "UTC", current])].sort();
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireAccount();
  const step = parseStep((await searchParams).step);
  const index = onboardingSteps.indexOf(step);
  const next = onboardingSteps[index + 1];
  const t = await getTranslations("onboarding");
  const progress = t("progress", { current: index + 1, total: onboardingSteps.length });

  return (
    <div className="auth-card">
      <p className="auth-step">{progress}</p>

      {step === "welcome" ? (
        <>
          <Heart aria-hidden="true" className="auth-card__icon" />
          <AuthHeading title={t("welcome.title")} lede={t("welcome.lede")} />
          <blockquote className="auth-verse">
            <p>{t("welcome.verseText")}</p>
            <footer>{t("welcome.verseReference")}</footer>
          </blockquote>
          <WelcomeForm displayName={profile.display_name ?? ""} />
        </>
      ) : null}

      {step === "why" ? (
        <>
          <Lock aria-hidden="true" className="auth-card__icon" />
          <AuthHeading title={t("why.title")} lede={t("why.lede")} />
          <WhyForm />
          <SkipStepLink to={`/welcome?step=${next}`} />
        </>
      ) : null}

      {step === "reminder" ? (
        <>
          <Moon aria-hidden="true" className="auth-card__icon" />
          <AuthHeading title={t("reminder.title")} lede={t("reminder.lede")} />
          <ReminderForm timezone={profile.timezone} timezones={timezoneOptions(profile.timezone)} />
          <SkipStepLink to={`/welcome?step=${next}`} />
        </>
      ) : null}

      {step === "discreet" ? (
        <>
          <Lock aria-hidden="true" className="auth-card__icon" />
          <AuthHeading title={t("discreet.title")} lede={t("discreet.lede")} />
          <DiscreetForm />
        </>
      ) : null}

      {step === "group" ? (
        <>
          <Users aria-hidden="true" className="auth-card__icon" />
          <AuthHeading title={t("group.title")} lede={t("group.lede")} />
          <ul className="onboarding-options">
            <li className="ui-card">
              <span className="ui-card__title">{t("group.create")}</span>
              <span className="text-muted">{t("group.comingSoon")}</span>
            </li>
            <li className="ui-card">
              <span className="ui-card__title">{t("group.join")}</span>
              <span className="text-muted">{t("group.comingSoon")}</span>
            </li>
          </ul>
          <FinishOnboardingButton />
        </>
      ) : null}
    </div>
  );
}
