"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";

import { twoStepSetupAction } from "../server/security-actions";
import { initialTwoStepSetupState } from "../security-state";
import { SubmitButton } from "./form-parts";

/** Ten recovery codes, shown once. Focus moves to the heading so screen readers announce it. */
export function RecoveryCodeList({ codes }: { codes: string[] }) {
  const t = useTranslations("security.twoStep");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="security-codes">
      <h3 ref={heading} tabIndex={-1} className="profile-section__title">
        {t("codesTitle")}
      </h3>
      <p>{t("codesBody")}</p>
      <ol className="security-codes__list" aria-label={t("codesListLabel")}>
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ol>
      <div>
        {/* A fresh page load: the codes leave the screen and the status updates. */}
        <Button onClick={() => window.location.assign(window.location.pathname)}>{t("codesDone")}</Button>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="ui-error-text" role="alert">
      <CircleAlert aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

/**
 * The two-step section's body: `children` is the server-rendered status
 * (and, when on, the recovery-code and turn-off controls). When off, it adds
 * the setup flow: start, scan and confirm, then save recovery codes.
 *
 * It stays mounted whether two-step sign-in is on or off: confirming the
 * code sets new session cookies, which makes Next.js re-render the page as
 * "on", and the recovery codes must survive that to be shown once.
 */
export function TwoStepSetup({ on, children }: { on: boolean; children: ReactNode }) {
  const t = useTranslations("security.twoStep");
  const tAuth = useTranslations("auth");
  const [state, action] = useActionState(twoStepSetupAction, initialTwoStepSetupState);
  const scanHeading = useRef<HTMLHeadingElement>(null);
  const scanning = state.status === "scanning";

  useEffect(() => {
    if (scanning && !state.error) scanHeading.current?.focus();
  }, [scanning, state.error]);

  if (state.status === "codes" && state.recoveryCodes) return <RecoveryCodeList codes={state.recoveryCodes} />;
  if (on) return <>{children}</>;

  if (scanning && state.factorId && state.qrCode && state.secret) {
    const codeError = state.error ? tAuth(`errors.${state.error}`) : undefined;
    return (
      <div className="security-setup">
        <h3 ref={scanHeading} tabIndex={-1} className="profile-section__title">
          {t("scanTitle")}
        </h3>
        <p>{t("scanBody")}</p>
        {/* A data: URI from Supabase: an SVG drawn as an image can't run scripts. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="security-qr" src={state.qrCode} alt={t("qrAlt")} width={200} height={200} />
        <p className="security-key">
          {t("keyLabel")} <code>{state.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
        </p>
        <form action={action} className="auth-form" noValidate>
          <input type="hidden" name="intent" value="confirm" />
          <input type="hidden" name="factorId" value={state.factorId} />
          <TextField
            id="setup-code"
            name="code"
            label={t("codeLabel")}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={8}
            spellCheck={false}
            required
            error={codeError}
          />
          <SubmitButton pendingLabel={t("confirming")}>{t("confirm")}</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      {children}
      {state.error ? <FormError message={tAuth(`errors.${state.error}`)} /> : null}
      <input type="hidden" name="intent" value="start" />
      <div>
        <SubmitButton pendingLabel={t("starting")}>{t("start")}</SubmitButton>
      </div>
    </form>
  );
}
