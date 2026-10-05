"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { initialAuthFormState } from "../form-state";
import { PASSWORD_MIN_LENGTH, PASSWORD_RECOMMENDED_LENGTH } from "../policy";
import { resetPasswordAction } from "../server/actions";
import { ErrorSummary, PasswordField, SubmitButton } from "./form-parts";

/** Choose a new password after following a reset link (the link signed the person in). */
export function ResetPasswordForm({ email }: { email: string | null }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(resetPasswordAction, initialAuthFormState);
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} fieldIds={{ password: "new-password" }} />
      {/* Lets password managers save the new password against the right account. */}
      {email ? <input type="email" name="username" autoComplete="username" value={email} readOnly hidden /> : null}
      <PasswordField
        id="new-password"
        label={t("fields.newPassword")}
        hint={t("fields.newPasswordHint", { min: PASSWORD_MIN_LENGTH, recommended: PASSWORD_RECOMMENDED_LENGTH })}
        enterKeyHint="done"
        minLength={PASSWORD_MIN_LENGTH}
        error={passwordError ? t(`errors.${passwordError}`) : undefined}
      />
      <SubmitButton pendingLabel={t("resetPassword.pending")}>{t("resetPassword.submit")}</SubmitButton>
    </form>
  );
}
