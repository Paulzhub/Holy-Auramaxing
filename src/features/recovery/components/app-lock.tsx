"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import { BrandMark } from "@/components/shell/brand-mark";
import { buttonVariants } from "@/components/ui/button-variants";
import { afterWrongPin, PIN_LENGTH, pinPattern } from "@/lib/app-lock";

import { checkPin, runDeviceCheck } from "../lock-crypto";
import {
  followOtherTabs,
  forgetLock,
  isLocked,
  lockIfDue,
  markSeen,
  readFails,
  readRecord,
  subscribeLock,
  unlock,
  writeFails,
} from "../lock-store";

/**
 * The lock screen (CLAUDE.md §7.10, D-113). The boot script has already
 * hidden the page before it painted (html[data-locked]); this shows the app's
 * name and nothing else about the person, and asks for the PIN or the
 * device's fingerprint or face check. The page underneath stays hidden and
 * inert until it opens. "Forgot PIN?" signs out, which forgets the lock on
 * this device.
 *
 * The markup is always in the page (hidden by CSS while unlocked), so it is
 * there before any JavaScript runs. The PIN never goes in a form: nothing is
 * sent anywhere, even before the page is ready.
 */

const SEEN_EVERY_MS = 15_000;

const getServerSnapshot = () => false;
const getServerRecord = () => null;

/**
 * `owner` and `signOut` are missing only on the offline page (D-124), which
 * can't know who is signed in from the server and can't sign anyone out:
 * there the lock still applies, and "Forgot PIN" waits for a connection.
 */
export function AppLock({ owner, signOut }: { owner?: string; signOut?: () => Promise<void> }) {
  const t = useTranslations("lock");
  const tApp = useTranslations("app");
  const locked = useSyncExternalStore(subscribeLock, isLocked, getServerSnapshot);
  const record = useSyncExternalStore(subscribeLock, readRecord, getServerRecord);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // A lock set by another account on this device is not this person's: forget it.
  useEffect(() => {
    const r = readRecord();
    if (owner !== undefined && r && r.owner !== owner) forgetLock();
    else lockIfDue();
  }, [owner]);

  // Keep "last seen" fresh while the app is in front of someone, and check on every return.
  useEffect(() => {
    const seen = () => {
      if (document.visibilityState === "visible" && !isLocked()) markSeen();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!isLocked()) markSeen();
      } else lockIfDue();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) lockIfDue();
    };
    const onPageHide = () => {
      if (!isLocked()) markSeen();
    };
    const timer = window.setInterval(seen, SEEN_EVERY_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("storage", followOtherTabs);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("storage", followOtherTabs);
    };
  }, []);

  // Locked: the page underneath can't be reached by keyboard or screen reader, and focus goes to the PIN.
  // Unlocked again: focus goes back where it was (or to the page's main area).
  useEffect(() => {
    const regions = document.querySelectorAll<HTMLElement>("[data-lockable]");
    regions.forEach((el) => {
      el.inert = locked;
    });
    if (locked) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !active.closest(".app-lock")) {
        returnTo.current = active;
      }
      input.current?.focus();
      return;
    }
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.isConnected) back.focus();
  }, [locked]);

  const waitText = useCallback(
    (until: number) => {
      const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(until);
      return t("wait", { time });
    },
    [t],
  );

  const opened = () => {
    setPin("");
    setMessage("");
    unlock();
  };

  const tryPin = async () => {
    const r = readRecord();
    if (!r || busy) return;
    const fails = readFails();
    if (fails.until > Date.now()) {
      setMessage(waitText(fails.until));
      return;
    }
    if (!pinPattern.test(pin)) {
      setMessage(t("format", { length: PIN_LENGTH }));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (await checkPin(pin, r.pin)) {
        opened();
        return;
      }
      const next = afterWrongPin(fails, Date.now());
      writeFails(next);
      setPin("");
      setMessage(next.until ? waitText(next.until) : t("wrong"));
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const tryDevice = async () => {
    const r = readRecord();
    if (!r?.credentialId || busy) return;
    setBusy(true);
    try {
      if (await runDeviceCheck(r.credentialId)) {
        opened();
        return;
      }
      setMessage(t("deviceFailed"));
    } catch {
      setMessage(t("deviceFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void tryPin();
    }
  };

  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-labelledby="app-lock-name">
      <div className="app-lock__panel">
        <BrandMark />
        <h2 id="app-lock-name" className="app-lock__name">
          {tApp("tabName")}
        </h2>
        <div className="ui-field app-lock__field">
          <label htmlFor="app-lock-pin" className="ui-label">
            {t("pinLabel")}
          </label>
          <input
            ref={input}
            id="app-lock-pin"
            className="ui-input app-lock__input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
            onKeyDown={onKeyDown}
            aria-describedby="app-lock-message"
            disabled={!locked}
          />
        </div>
        <div className="app-lock__actions">
          <button
            type="button"
            className={buttonVariants({ variant: "primary" })}
            onClick={() => void tryPin()}
            aria-busy={busy || undefined}
            disabled={!locked}
          >
            {t("unlock")}
          </button>
          {record?.credentialId ? (
            <button
              type="button"
              className={buttonVariants({ variant: "secondary" })}
              onClick={() => void tryDevice()}
              disabled={!locked}
            >
              {t("deviceCheck")}
            </button>
          ) : null}
        </div>
        <p id="app-lock-message" className="app-lock__message" aria-live="polite">
          {message}
        </p>
        {signOut ? (
          <form action={signOut} onSubmit={() => forgetLock({ keepCovered: true })}>
            <button type="submit" className={buttonVariants({ variant: "ghost" })} disabled={!locked}>
              {t("forgot")}
            </button>
          </form>
        ) : (
          <p className="text-muted">{t("forgotOffline")}</p>
        )}
      </div>
    </div>
  );
}
