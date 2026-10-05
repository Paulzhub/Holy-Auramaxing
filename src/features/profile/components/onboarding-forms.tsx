"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Link } from "@/i18n/navigation";

import { DISPLAY_NAME_MAX, MY_WHY_MAX, type OnboardingFormState } from "../onboarding";
import { saveDiscreetAction, saveReminderAction, saveWelcomeAction, saveWhyAction } from "../server/onboarding-actions";

const initial: OnboardingFormState = {};

function Continue() {
  const t = useTranslations("onboarding");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} loadingLabel={t("saving")} className="auth-submit">
      {t("continue")}
    </Button>
  );
}

/** Announced and focused when a step can't be saved. */
function StepError({ state }: { state: OnboardingFormState }) {
  const t = useTranslations("onboarding.errors");
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) ref.current?.focus();
  }, [state]);
  if (!state.error) return null;
  return (
    <p ref={ref} className="ui-error-text" role="alert" tabIndex={-1} id="step-error">
      <CircleAlert aria-hidden="true" />
      <span>{t(state.error)}</span>
    </p>
  );
}

/** Lets people move on without answering (every step is optional, §7.2). */
export function SkipStepLink({ to }: { to: string }) {
  const t = useTranslations("onboarding");
  return (
    <p className="auth-switch">
      <Link href={to}>{t("skipStep")}</Link>
    </p>
  );
}

export function WelcomeForm({ displayName }: { displayName: string }) {
  const t = useTranslations("onboarding.welcome");
  const [state, action] = useActionState(saveWelcomeAction, initial);
  return (
    <form action={action} className="auth-form" noValidate>
      <StepError state={state} />
      <TextField
        id="displayName"
        name="displayName"
        label={t("nameLabel")}
        hint={t("nameHint")}
        defaultValue={displayName}
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX}
        enterKeyHint="next"
        aria-invalid={state.error ? true : undefined}
      />
      <Continue />
    </form>
  );
}

export function WhyForm() {
  const t = useTranslations("onboarding.why");
  const [state, action] = useActionState(saveWhyAction, initial);
  return (
    <form action={action} className="auth-form" noValidate>
      <StepError state={state} />
      <div className="ui-field">
        <label className="ui-label" htmlFor="myWhy">
          {t("label")}
        </label>
        <p className="ui-hint" id="myWhy-hint">
          {t("hint", { max: MY_WHY_MAX })}
        </p>
        <textarea
          id="myWhy"
          name="myWhy"
          className="ui-input onboarding-textarea"
          rows={5}
          maxLength={MY_WHY_MAX}
          aria-describedby="myWhy-hint"
          aria-invalid={state.error ? true : undefined}
        />
      </div>
      <Continue />
    </form>
  );
}

export function ReminderForm({ timezone, timezones }: { timezone: string; timezones: string[] }) {
  const t = useTranslations("onboarding.reminder");
  const [state, action] = useActionState(saveReminderAction, initial);
  return (
    <form action={action} className="auth-form" noValidate>
      <StepError state={state} />
      <TextField
        id="reminderTime"
        name="reminderTime"
        type="time"
        label={t("timeLabel")}
        hint={t("timeHint")}
        defaultValue="21:00"
      />
      <div className="ui-field">
        <label className="ui-label" htmlFor="timezone">
          {t("timezoneLabel")}
        </label>
        <p className="ui-hint" id="timezone-hint">
          {t("timezoneHint")}
        </p>
        <select
          id="timezone"
          name="timezone"
          className="ui-input"
          defaultValue={timezone}
          aria-describedby="timezone-hint"
        >
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <Continue />
    </form>
  );
}

export function DiscreetForm() {
  const t = useTranslations("onboarding.discreet");
  const [state, action] = useActionState(saveDiscreetAction, initial);
  return (
    <form action={action} className="auth-form" noValidate>
      <StepError state={state} />
      <div className="auth-check">
        <input type="checkbox" id="discreetMode" name="discreetMode" defaultChecked aria-describedby="discreet-hint" />
        <label htmlFor="discreetMode">{t("label")}</label>
      </div>
      <p className="ui-hint auth-check__hint" id="discreet-hint">
        {t("hint")}
      </p>
      <Continue />
    </form>
  );
}
