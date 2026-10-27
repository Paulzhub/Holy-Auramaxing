"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { serviceWorkerUrl } from "@/lib/pwa/version";

/**
 * This device's Web Push switch (CLAUDE.md §7.8, §13; D-092).
 *
 *  - "explainer": a card on the check-in page, shown only after a check-in
 *    and only while this device could be asked (supported, not yet asked,
 *    not dismissed). The browser's own permission prompt comes only after
 *    the person presses "Turn on", never on page load.
 *  - "settings": the same switch on the settings page, with on, off and
 *    blocked states.
 *
 * On iPhone and iPad, Web Push works only in a web app added to the Home
 * Screen (iOS 16.4+): in Safari the settings switch shows the three steps
 * instead, and the explainer stays away until the install card (D-127) has
 * done its job. The service
 * worker is registered only when the person turns push on. Labels arrive
 * as props (no message bundle); status changes are announced politely.
 */

type State = "loading" | "unsupported" | "ios" | "blocked" | "off" | "on" | "working";

export interface PushLabels {
  explainerTitle: string;
  explainerBody: string;
  turnOn: string;
  notNow: string;
  on: string;
  turnOff: string;
  off: string;
  blocked: string;
  unsupported: string;
  iosTitle: string;
  iosStep1: string;
  iosStep2: string;
  iosStep3: string;
  working: string;
  failed: string;
}

const DISMISSED = "push-explainer-dismissed";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

export function PushControl({
  vapidKey,
  labels,
  mode,
}: {
  vapidKey: string;
  labels: PushLabels;
  mode: "explainer" | "settings";
}) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      let hidden = false;
      try {
        hidden = mode === "explainer" && window.localStorage.getItem(DISMISSED) === "1";
      } catch {
        hidden = false;
      }
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: State;
      if (!supported) next = isAppleMobile() && !isStandalone() ? "ios" : "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else next = (await currentSubscription().catch(() => null)) ? "on" : "off";
      if (active) {
        setDismissed(hidden);
        setState(next);
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, [mode]);

  const turnOn = async () => {
    setState("working");
    setMessage(labels.working);
    try {
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: "/" });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        setMessage(permission === "denied" ? labels.blocked : "");
        return;
      }
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("subscribe");
      setState("on");
      setMessage(labels.on);
    } catch {
      setState("off");
      setMessage(labels.failed);
    }
  };

  const turnOff = async () => {
    setState("working");
    setMessage(labels.working);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("off");
      setMessage(labels.off);
    } catch {
      setState("on");
      setMessage(labels.failed);
    }
  };

  const notNow = () => {
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      // Private mode: it simply shows again next time.
    }
    setDismissed(true);
  };

  const status = (
    // A polite live region without role="status": the thank-you page already
    // has one status (the saved answer), and two would compete.
    <p className="ui-hint" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );

  const iosSteps = (
    <div className="grid gap-2" data-testid="ios-install">
      <p className="notify-row__name">{labels.iosTitle}</p>
      <ol className="push-steps">
        <li>{labels.iosStep1}</li>
        <li>{labels.iosStep2}</li>
        <li>{labels.iosStep3}</li>
      </ol>
    </div>
  );

  if (mode === "explainer") {
    // Only while this device could still be asked; otherwise nothing at all.
    // Safari on iPhone outside the Home Screen: the install card comes first
    // (D-127); once the app is installed, this card can ask.
    const askable = state === "off" || (state === "working" && !dismissed);
    if (dismissed || !askable) return status;
    return (
      <section className="ui-card push-explainer" aria-labelledby="push-explainer-title" data-testid="push-explainer">
        <div className="grid gap-3">
          <h2 id="push-explainer-title" className="profile-section__title">
            <BellRing aria-hidden="true" className="push-explainer__icon" />
            {labels.explainerTitle}
          </h2>
          <p className="text-muted">{labels.explainerBody}</p>
          <div className="alerts-toolbar">
            <Button onClick={() => void turnOn()} loading={state === "working"} loadingLabel={labels.working}>
              {labels.turnOn}
            </Button>
            <Button variant="ghost" onClick={notNow}>
              {labels.notNow}
            </Button>
          </div>
          {status}
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-3" data-testid="push-control">
      {state === "loading" ? null : state === "unsupported" ? (
        <p>{labels.unsupported}</p>
      ) : state === "ios" ? (
        iosSteps
      ) : state === "blocked" ? (
        <p>{labels.blocked}</p>
      ) : state === "on" ? (
        <>
          <p>{labels.on}</p>
          <div>
            <Button variant="secondary" onClick={() => void turnOff()}>
              {labels.turnOff}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p>{labels.off}</p>
          <div>
            <Button onClick={() => void turnOn()} loading={state === "working"} loadingLabel={labels.working}>
              {labels.turnOn}
            </Button>
          </div>
        </>
      )}
      {status}
    </div>
  );
}
