"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { TextField } from "@/components/ui/text-field";

import { initialAuthFormState } from "../form-state";
import { redeemRecoveryCodeAction, verifyTotpAction } from "../server/mfa-actions";
import { ErrorSummary, NextInput, SubmitButton } from "./form-parts";

/** The 6-digit code from the authenticator app (/sign-in/verify). */
export function VerifyCodeForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(verifyTotpAction, initialAuthFormState);
  const error = state.fieldErrors?.code;

  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} fieldIds={{ code: "code" }} />
      <TextField
        id="code"
        name="code"
        label={t("verify.codeLabel")}
        hint={t("verify.codeHint")}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={8}
        enterKeyHint="done"
        spellCheck={false}
        required
        // The page is only about this one field.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        error={error ? t(`errors.${error}`) : undefined}
      />
      <NextInput next={next} />
      <SubmitButton pendingLabel={t("verify.pending")}>{t("verify.submit")}</SubmitButton>
    </form>
  );
}

/** One of the ten recovery codes, for when the app isn't available. */
export function RecoveryCodeForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(redeemRecoveryCodeAction, initialAuthFormState);
  const error = state.fieldErrors?.recoveryCode;

  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} fieldIds={{ recoveryCode: "recovery-code" }} />
      <TextField
        id="recovery-code"
        name="recoveryCode"
        label={t("verify.recoveryLabel")}
        hint={t("verify.recoveryHint")}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={40}
        required
        error={error ? t(`errors.${error}`) : undefined}
      />
      <NextInput next={next} />
      <SubmitButton pendingLabel={t("verify.recoveryPending")}>{t("verify.recoverySubmit")}</SubmitButton>
    </form>
  );
}
