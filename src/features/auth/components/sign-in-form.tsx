"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { TextField } from "@/components/ui/text-field";
import { Link } from "@/i18n/navigation";

import { initialAuthFormState } from "../form-state";
import { signInAction } from "../server/actions";
import { ErrorSummary, NextInput, PasswordField, SubmitButton } from "./form-parts";
import { Turnstile } from "./turnstile";

export function SignInForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(signInAction, initialAuthFormState);
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} fieldIds={{ email: "email", password: "current-password" }} />
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
        id="current-password"
        label={t("fields.password")}
        enterKeyHint="done"
        error={passwordError ? t(`errors.${passwordError}`) : undefined}
      />
      <p className="auth-aside">
        <Link href="/forgot-password">{t("signIn.forgot")}</Link>
      </p>
      <NextInput next={next} />
      <Turnstile action="sign-in" resetSignal={state} />
      <SubmitButton pendingLabel={t("signIn.pending")}>{t("signIn.submit")}</SubmitButton>
    </form>
  );
}
