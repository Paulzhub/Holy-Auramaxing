"use client";

import { CircleAlert, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";

import type { AuthErrorKey } from "../form-state";
import { finishPasskeyRegistrationAction, startPasskeyRegistrationAction } from "../server/passkey-actions";
import { ceremonyError, creationOptionsFromJSON, credentialToJSON, passkeysSupported } from "../webauthn";

function noopSubscribe() {
  return () => {};
}

/** "Add a passkey" on Settings → Security (D-029). */
export function PasskeyAddButton() {
  const t = useTranslations("security.passkeys");
  const tAuth = useTranslations("auth");
  const supported = useSyncExternalStore(noopSubscribe, passkeysSupported, () => true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AuthErrorKey | null>(null);

  if (!supported) return <p className="text-muted">{t("unsupported")}</p>;

  function add() {
    setError(null);
    startTransition(async () => {
      try {
        const start = await startPasskeyRegistrationAction();
        if (!start.ok) {
          setError(start.error);
          return;
        }
        let credential: PublicKeyCredential | null;
        try {
          credential = (await navigator.credentials.create({
            publicKey: creationOptionsFromJSON(start.options),
          })) as PublicKeyCredential | null;
        } catch (cause) {
          setError(ceremonyError(cause));
          return;
        }
        if (!credential) {
          setError("passkeyCancelled");
          return;
        }
        const finish = await finishPasskeyRegistrationAction({
          challengeId: start.challengeId,
          credential: credentialToJSON(credential),
        });
        if (!finish.ok) {
          setError(finish.error);
          return;
        }
        window.location.assign(finish.redirectTo);
      } catch {
        setError("passkeyFailed");
      }
    });
  }

  return (
    <div className="grid gap-2">
      {error ? (
        <p className="ui-error-text" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{tAuth(`errors.${error}`, { minutes: 15 })}</span>
        </p>
      ) : null}
      <div>
        <Button variant="secondary" loading={pending} loadingLabel={t("adding")} onClick={add}>
          {pending ? null : <KeyRound aria-hidden="true" />}
          {t("add")}
        </Button>
      </div>
    </div>
  );
}
