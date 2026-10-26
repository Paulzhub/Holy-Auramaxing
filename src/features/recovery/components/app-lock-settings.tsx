"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useSyncExternalStore, type FormEvent } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import {
  AUTO_LOCK_MINUTES,
  DEFAULT_AUTO_LOCK,
  PIN_LENGTH,
  pinPattern,
  type AutoLockMinutes,
  type LockRecord,
} from "@/lib/app-lock";

import { checkPin, createDeviceCheck, deviceCheckAvailable, hashPin } from "../lock-crypto";
import { forgetLock, lockNow, readRecord, subscribeLock, writeRecord } from "../lock-store";

/**
 * Settings → Security → "App lock" (CLAUDE.md §7.10, D-113): set per device,
 * so it lives only in this browser. A 6-digit PIN, optionally the device's
 * fingerprint or face, and how long the app may be away before it locks.
 * Changing or turning it off asks for the current PIN.
 */

type Mode = "idle" | "setup" | "change" | "off";

const getServerRecord = () => null;
const storageWorks = () => {
  try {
    const k = "ha-lock-probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
};
const noStorageOnServer = () => true;
const subscribeNothing = () => () => {};

function PinField({ id, label, name }: { id: string; label: string; name: string }) {
  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        className="ui-input app-lock-settings__pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_LENGTH}
        pattern={`\\d{${PIN_LENGTH}}`}
        required
      />
    </div>
  );
}

export function AppLockSettings({ owner }: { owner: string }) {
  const t = useTranslations("security.appLock");
  const tApp = useTranslations("app");
  const record = useSyncExternalStore(subscribeLock, readRecord, getServerRecord);
  const canStore = useSyncExternalStore(subscribeNothing, storageWorks, noStorageOnServer);
  const [mode, setMode] = useState<Mode>("idle");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deviceCheck, setDeviceCheck] = useState(false);
  const ids = useId();
  const mine = record && record.owner === owner ? record : null;

  useEffect(() => {
    let live = true;
    void deviceCheckAvailable().then((ok) => {
      if (live) setDeviceCheck(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  const save = (next: LockRecord, note: string) => {
    writeRecord(next);
    setMode("idle");
    setMessage(note);
  };

  const newPin = (form: FormData): string | null => {
    const pin = String(form.get("pin") ?? "");
    const again = String(form.get("pinAgain") ?? "");
    if (!pinPattern.test(pin)) {
      setMessage(t("errors.format", { length: PIN_LENGTH }));
      return null;
    }
    if (pin !== again) {
      setMessage(t("errors.mismatch"));
      return null;
    }
    return pin;
  };

  const currentPinOk = async (form: FormData): Promise<boolean> => {
    if (!mine || (await checkPin(String(form.get("current") ?? ""), mine.pin))) return true;
    setMessage(t("errors.current"));
    return false;
  };

  const run = async (e: FormEvent<HTMLFormElement>, work: (form: FormData) => Promise<void>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await work(new FormData(e.currentTarget));
    } catch {
      setMessage(t("errors.failed"));
    } finally {
      setBusy(false);
    }
  };

  const onSetup = (e: FormEvent<HTMLFormElement>) =>
    run(e, async (form) => {
      const pin = newPin(form);
      if (!pin) return;
      const after = Number(form.get("after") ?? DEFAULT_AUTO_LOCK) as AutoLockMinutes;
      save(
        {
          v: 1,
          owner,
          after: (AUTO_LOCK_MINUTES as readonly number[]).includes(after) ? after : DEFAULT_AUTO_LOCK,
          pin: await hashPin(pin),
          credentialId: null,
        },
        t("notices.on"),
      );
    });

  const onChange = (e: FormEvent<HTMLFormElement>) =>
    run(e, async (form) => {
      if (!mine || !(await currentPinOk(form))) return;
      const pin = newPin(form);
      if (!pin) return;
      save({ ...mine, pin: await hashPin(pin) }, t("notices.changed"));
    });

  const onOff = (e: FormEvent<HTMLFormElement>) =>
    run(e, async (form) => {
      if (!(await currentPinOk(form))) return;
      forgetLock();
      setMode("idle");
      setMessage(t("notices.off"));
    });

  const setAfter = (after: AutoLockMinutes) => {
    if (!mine) return;
    writeRecord({ ...mine, after });
    setMessage(t("notices.afterSaved"));
  };

  const addDevice = async () => {
    if (!mine || busy) return;
    setBusy(true);
    try {
      const id = await createDeviceCheck(tApp("tabName"));
      if (id) save({ ...mine, credentialId: id }, t("notices.deviceAdded"));
      else setMessage(t("errors.device"));
    } catch {
      setMessage(t("errors.device"));
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = () => {
    if (!mine) return;
    save({ ...mine, credentialId: null }, t("notices.deviceRemoved"));
  };

  const afterLabel = (m: AutoLockMinutes) => (m === 0 ? t("after.now") : t("after.minutes", { count: m }));

  return (
    <section aria-labelledby="app-lock-title" className="profile-section app-lock-settings">
      <h2 id="app-lock-title" className="profile-section__title">
        {t("title")} <span className="ui-tag">{mine ? t("on") : t("off")}</span>
      </h2>
      <p className="text-muted">{t("body")}</p>

      {!canStore ? (
        <p>{t("noStorage")}</p>
      ) : mine ? (
        <>
          <p className="app-lock-settings__state">{t("isOn")}</p>
          <fieldset className="app-lock-settings__after">
            <legend className="ui-label">{t("after.legend")}</legend>
            {AUTO_LOCK_MINUTES.map((m) => (
              <label key={m} className="app-lock-settings__choice">
                <input type="radio" name="after-now" checked={mine.after === m} onChange={() => setAfter(m)} />
                <span>{afterLabel(m)}</span>
              </label>
            ))}
          </fieldset>
          <div className="app-lock-settings__actions">
            <button type="button" className={buttonVariants({ variant: "secondary" })} onClick={() => lockNow()}>
              {t("lockNow")}
            </button>
            {mine.credentialId ? (
              <button type="button" className={buttonVariants({ variant: "ghost" })} onClick={removeDevice}>
                {t("removeDevice")}
              </button>
            ) : deviceCheck ? (
              <button
                type="button"
                className={buttonVariants({ variant: "secondary" })}
                onClick={() => void addDevice()}
                aria-busy={busy || undefined}
              >
                {t("addDevice")}
              </button>
            ) : null}
            <button
              type="button"
              className={buttonVariants({ variant: "ghost" })}
              aria-expanded={mode === "change"}
              onClick={() => setMode(mode === "change" ? "idle" : "change")}
            >
              {t("change")}
            </button>
            <button
              type="button"
              className={buttonVariants({ variant: "ghost" })}
              aria-expanded={mode === "off"}
              onClick={() => setMode(mode === "off" ? "idle" : "off")}
            >
              {t("turnOff")}
            </button>
          </div>
          {mode === "change" ? (
            <form onSubmit={onChange} className="app-lock-settings__form" noValidate>
              <PinField id={`${ids}-current`} name="current" label={t("currentPin")} />
              <PinField id={`${ids}-pin`} name="pin" label={t("newPin", { length: PIN_LENGTH })} />
              <PinField id={`${ids}-again`} name="pinAgain" label={t("pinAgain")} />
              <button type="submit" className={buttonVariants({ variant: "primary" })} aria-busy={busy || undefined}>
                {t("saveChange")}
              </button>
            </form>
          ) : null}
          {mode === "off" ? (
            <form onSubmit={onOff} className="app-lock-settings__form" noValidate>
              <PinField id={`${ids}-off`} name="current" label={t("currentPin")} />
              <button type="submit" className={buttonVariants({ variant: "primary" })} aria-busy={busy || undefined}>
                {t("confirmOff")}
              </button>
            </form>
          ) : null}
        </>
      ) : mode === "setup" ? (
        <form onSubmit={onSetup} className="app-lock-settings__form" noValidate>
          <PinField id={`${ids}-pin`} name="pin" label={t("newPin", { length: PIN_LENGTH })} />
          <PinField id={`${ids}-again`} name="pinAgain" label={t("pinAgain")} />
          <fieldset className="app-lock-settings__after">
            <legend className="ui-label">{t("after.legend")}</legend>
            {AUTO_LOCK_MINUTES.map((m) => (
              <label key={m} className="app-lock-settings__choice">
                <input type="radio" name="after" value={m} defaultChecked={m === DEFAULT_AUTO_LOCK} />
                <span>{afterLabel(m)}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-muted">{t("forgotHint")}</p>
          <div className="app-lock-settings__actions">
            <button type="submit" className={buttonVariants({ variant: "primary" })} aria-busy={busy || undefined}>
              {t("turnOn")}
            </button>
            <button type="button" className={buttonVariants({ variant: "ghost" })} onClick={() => setMode("idle")}>
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : (
        <p>
          <button
            type="button"
            className={buttonVariants({ variant: "secondary" })}
            onClick={() => {
              setMessage("");
              setMode("setup");
            }}
          >
            {t("setUp")}
          </button>
        </p>
      )}

      <p className="app-lock-settings__message" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
