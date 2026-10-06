"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { recoveryCodesAction } from "../server/security-actions";
import { initialRecoveryCodesState } from "../security-state";
import { SubmitButton } from "./form-parts";
import { RecoveryCodeList } from "./two-step-setup";

/** Replaces the recovery codes and shows the new ones once. */
export function RecoveryCodesButton() {
  const t = useTranslations("security.twoStep");
  const tAuth = useTranslations("auth");
  const [state, action] = useActionState(recoveryCodesAction, initialRecoveryCodesState);

  if (state.status === "codes" && state.recoveryCodes) return <RecoveryCodeList codes={state.recoveryCodes} />;
  return (
    <form action={action} className="grid gap-2">
      {state.error ? (
        <p className="ui-error-text" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{tAuth(`errors.${state.error}`)}</span>
        </p>
      ) : null}
      <p className="ui-hint">{t("newCodesHint")}</p>
      <div>
        <SubmitButton pendingLabel={t("newCodesPending")}>{t("newCodes")}</SubmitButton>
      </div>
    </form>
  );
}
