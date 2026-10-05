"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { initialAuthFormState } from "../form-state";
import { ageAction } from "../server/actions";
import { ErrorSummary, FieldError, SubmitButton } from "./form-parts";

/** Step 1 of sign-up. Answering "No" stores nothing and creates nothing. */
export function AgeForm() {
  const t = useTranslations("auth.signUp.age");
  const tErr = useTranslations("auth.errors");
  const [state, action] = useActionState(ageAction, initialAuthFormState);
  const error = state.fieldErrors?.adult;

  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} fieldIds={{ adult: "adult-yes" }} />
      <fieldset className="auth-choice" aria-describedby={error ? "adult-error" : undefined}>
        <legend className="ui-label">{t("question")}</legend>
        <p className="ui-hint">{t("why")}</p>
        <label className="auth-choice__option">
          <input type="radio" name="adult" value="yes" id="adult-yes" required />
          <span>{t("yes")}</span>
        </label>
        <label className="auth-choice__option">
          <input type="radio" name="adult" value="no" id="adult-no" />
          <span>{t("no")}</span>
        </label>
        <FieldError id="adult-error" message={error ? tErr(error) : undefined} />
      </fieldset>
      <SubmitButton pendingLabel={t("pending")}>{t("submit")}</SubmitButton>
    </form>
  );
}
