"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { TextField } from "@/components/ui/text-field";

import { initialAuthFormState } from "../form-state";
import { PASSWORD_MIN_LENGTH, PASSWORD_RECOMMENDED_LENGTH } from "../policy";
import { emailSignUpAction } from "../server/actions";
import { ErrorSummary, PasswordField, SubmitButton } from "./form-parts";
import { Turnstile } from "./turnstile";

export function EmailSignUpForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(emailSignUpAction, initialAuthFormState);
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} fieldIds={{ email: "email", password: "new-password" }} />
      <TextField
        id="email"
        name="email"
        type="email"
        label={t("fields.email")}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="email"
        enterKeyHint="next"
        required
        defaultValue={state.email}
        error={emailError ? t(`errors.${emailError}`) : undefined}
      />
      <PasswordField
        id="new-password"
        label={t("fields.newPassword")}
        hint={t("fields.newPasswordHint", { min: PASSWORD_MIN_LENGTH, recommended: PASSWORD_RECOMMENDED_LENGTH })}
        enterKeyHint="done"
        minLength={PASSWORD_MIN_LENGTH}
        error={passwordError ? t(`errors.${passwordError}`) : undefined}
      />
      <Turnstile action="sign-up" resetSignal={state} />
      <SubmitButton pendingLabel={t("signUp.account.pending")}>{t("signUp.account.submit")}</SubmitButton>
    </form>
  );
}
