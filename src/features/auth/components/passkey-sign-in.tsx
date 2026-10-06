"use client";

import { CircleAlert, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import type { AuthErrorKey } from "../form-state";
import { finishPasskeySignInAction, startPasskeySignInAction } from "../server/passkey-actions";
import { ceremonyError, credentialToJSON, passkeysSupported, requestOptionsFromJSON } from "../webauthn";
import { Turnstile } from "./turnstile";

function noopSubscribe() {
  return () => {};
}

/**
 * "Sign in with a passkey" (D-029). Rendered only when the server has
 * passkeys switched on, and only shown in browsers that support them.
 */
export function PasskeySignIn({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const supported = useSyncExternalStore(noopSubscribe, passkeysSupported, () => false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ key: AuthErrorKey; minutes?: number } | null>(null);
  const [attempt, setAttempt] = useState(0);

  if (!supported) return null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const captchaToken = String(new FormData(event.currentTarget).get("captchaToken") ?? "") || undefined;
    setError(null);
    startTransition(async () => {
      try {
        const start = await startPasskeySignInAction(captchaToken);
        if (!start.ok) {
          setError({ key: start.error, minutes: start.retryAfterMinutes });
          return;
        }
        let credential: PublicKeyCredential | null;
        try {
          credential = (await navigator.credentials.get({
            publicKey: requestOptionsFromJSON(start.options),
          })) as PublicKeyCredential | null;
        } catch (cause) {
          setError({ key: ceremonyError(cause) });
          return;
        }
        if (!credential) {
          setError({ key: "passkeyCancelled" });
          return;
        }
        const finish = await finishPasskeySignInAction({
          challengeId: start.challengeId,
          credential: credentialToJSON(credential),
          next,
        });
        if (!finish.ok) {
          setError({ key: finish.error });
          return;
        }
        // A full page load, so the new session cookies apply everywhere.
        window.location.assign(finish.redirectTo);
      } catch {
        setError({ key: "passkeyFailed" });
      } finally {
        setAttempt((n) => n + 1);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="auth-form auth-form--inline" noValidate>
      {error ? (
        <p className="ui-error-text" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{t(`errors.${error.key}`, { minutes: error.minutes ?? 1 })}</span>
        </p>
      ) : null}
      <Turnstile action="passkey" resetSignal={attempt} />
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        loading={pending}
        loadingLabel={t("passkey.pending")}
        className="auth-submit"
      >
        {pending ? null : <KeyRound aria-hidden="true" />}
        {t("passkey.button")}
      </Button>
    </form>
  );
}
