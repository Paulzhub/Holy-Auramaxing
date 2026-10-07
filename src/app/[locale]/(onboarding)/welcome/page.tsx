import { Heart, Lock, Moon, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthHeading, requireAccount } from "@/features/auth";
import { previewHeldInvite } from "@/features/groups";
import { FinishOnboardingButton, onboardingSteps, parseStep } from "@/features/profile";
import { timezoneOptions } from "@/lib/timezones";
import { DiscreetForm, ReminderForm, SkipStepLink, WelcomeForm, WhyForm } from "@/features/profile/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("welcome") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireAccount();
  const step = parseStep((await searchParams).step);
  const index = onboardingSteps.indexOf(step);
  const next = onboardingSteps[index + 1];
  const t = await getTranslations("onboarding");
  const progress = t("progress", { current: index + 1, total: onboardingSteps.length });
  // Someone who opened an invite before signing up finds it waiting here.
  const invite = step === "group" ? await previewHeldInvite() : null;

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
          {invite?.status === "valid" && invite.groupName ? (
            <>
              <p className="auth-banner" role="status">
                {t("group.inviteWaiting", { name: invite.groupName })}
              </p>
              <FinishOnboardingButton to="/join" label={t("group.joinInvite", { name: invite.groupName })} />
            </>
          ) : null}
          <div className="onboarding-options">
            <FinishOnboardingButton to="/groups/new" label={t("group.create")} variant="secondary" />
            <FinishOnboardingButton to="/join" label={t("group.join")} variant="secondary" />
          </div>
          <p className="text-muted">{t("group.later")}</p>
          <FinishOnboardingButton />
        </>
      ) : null}
    </div>
  );
}
