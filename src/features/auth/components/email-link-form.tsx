"use client";

import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { TextField } from "@/components/ui/text-field";

import { initialAuthFormState } from "../form-state";
import { forgotPasswordAction, magicLinkAction, resendVerificationAction } from "../server/actions";
import { ErrorSummary, NextInput, SubmitButton } from "./form-parts";
import { Turnstile } from "./turnstile";

const actions = {
  magicLink: magicLinkAction,
  passwordReset: forgotPasswordAction,
  verification: resendVerificationAction,
} as const;

/**
 * One email field that sends a link: a magic sign-in link, a password reset
 * or a new verification email. The confirmation is the same whether or not
 * the address has an account, so the form can't be used to find out who
 * signed up.
 */
export function EmailLinkForm({ kind, next }: { kind: keyof typeof actions; next?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(actions[kind], initialAuthFormState);
  const emailError = state.fieldErrors?.email;

  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} fieldIds={{ email: `${kind}-email` }} />
      <div aria-live="polite" role="status" className="auth-sent">
        {state.status === "sent" && state.notice ? (
          <p className="auth-sent__message">
            <MailCheck aria-hidden="true" />
            <span>{t(`notices.${state.notice}`)}</span>
          </p>
        ) : null}
      </div>
      <TextField
        id={`${kind}-email`}
        name="email"
        type="email"
        label={kind === "magicLink" ? t("fields.linkEmail") : t("fields.email")}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="email"
        enterKeyHint="send"
        required
        defaultValue={state.email}
        error={emailError ? t(`errors.${emailError}`) : undefined}
      />
      <NextInput next={next} />
      <Turnstile action={kind} resetSignal={state} />
      <SubmitButton pendingLabel={t("emailLink.pending")}>
        {state.status === "sent" ? t(`emailLink.${kind}.again`) : t(`emailLink.${kind}.submit`)}
      </SubmitButton>
    </form>
  );
}
