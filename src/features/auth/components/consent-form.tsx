"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Link } from "@/i18n/navigation";

import { initialAuthFormState } from "../form-state";
import { consentAction } from "../server/actions";
import { ErrorSummary, FieldError, SubmitButton, TimezoneInput } from "./form-parts";

const collected = ["account", "checkins", "groups", "faith"] as const;
const promises = ["noSale", "noAds", "noTraining", "delete"] as const;

/**
 * Step 2 of sign-up: a plain-language, itemised notice (DPDP, GDPR Art. 9)
 * and two separate, unticked opt-in boxes.
 */
export function ConsentForm() {
  const t = useTranslations("auth.signUp.consent");
  const tErr = useTranslations("auth.errors");
  const [state, action] = useActionState(consentAction, initialAuthFormState);
  const termsError = state.fieldErrors?.termsPrivacy;
  const sensitiveError = state.fieldErrors?.sensitiveData;

  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} fieldIds={{ termsPrivacy: "consent-terms", sensitiveData: "consent-sensitive" }} />

      <section aria-labelledby="consent-collect" className="auth-notice-box">
        <h2 id="consent-collect" className="auth-subheading">
          {t("collectTitle")}
        </h2>
        <ul className="auth-list">
          {collected.map((key) => (
            <li key={key}>{t(`collect.${key}`)}</li>
          ))}
        </ul>
        <h2 className="auth-subheading">{t("promiseTitle")}</h2>
        <ul className="auth-list">
          {promises.map((key) => (
            <li key={key}>{t(`promise.${key}`)}</li>
          ))}
        </ul>
        <p className="text-muted">{t("notMedical")}</p>
        <p>
          {t.rich("readMore", {
            privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
            terms: (chunks) => <Link href="/terms">{chunks}</Link>,
            yourData: (chunks) => <Link href="/your-data">{chunks}</Link>,
          })}
        </p>
      </section>

      <div className="auth-check">
        <input
          type="checkbox"
          id="consent-terms"
          name="termsPrivacy"
          required
          aria-invalid={termsError ? true : undefined}
          aria-describedby={termsError ? "consent-terms-error" : undefined}
        />
        <label htmlFor="consent-terms">{t("termsLabel")}</label>
      </div>
      <FieldError id="consent-terms-error" message={termsError ? tErr(termsError) : undefined} />

      <div className="auth-check">
        <input
          type="checkbox"
          id="consent-sensitive"
          name="sensitiveData"
          required
          aria-invalid={sensitiveError ? true : undefined}
          aria-describedby={["consent-sensitive-hint", sensitiveError ? "consent-sensitive-error" : ""]
            .filter(Boolean)
            .join(" ")}
        />
        <label htmlFor="consent-sensitive">{t("sensitiveLabel")}</label>
      </div>
      <p className="ui-hint auth-check__hint" id="consent-sensitive-hint">
        {t("sensitiveHint")}
      </p>
      <FieldError id="consent-sensitive-error" message={sensitiveError ? tErr(sensitiveError) : undefined} />

      <TimezoneInput />
      <SubmitButton pendingLabel={t("pending")}>{t("submit")}</SubmitButton>
    </form>
  );
}
