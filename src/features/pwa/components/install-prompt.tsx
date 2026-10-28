"use client";

import { Share, Smartphone } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import {
  currentInstallWay,
  isSnoozed,
  promptInstall,
  snooze,
  subscribeInstall,
  type InstallWay,
} from "../install-store";

export interface InstallLabels {
  title: string;
  body: string;
  install: string;
  notNow: string;
  iosTitle: string;
  iosBody: string;
  iosShow: string;
  iosStep1: string;
  iosStep2: string;
  iosStep3: string;
  close: string;
  installed: string;
  unavailable: string;
  installedNow: string;
}

const getServerWay = (): InstallWay => "none";
const getServerSnoozed = () => false;
const snoozedNow = () => isSnoozed();

/**
 * The custom install prompt (CLAUDE.md §13; D-127).
 *
 *  - "card": after the first check-in (where the push explainer is), only
 *    while this device can install the app and the person hasn't said "Not
 *    now" in the last 30 days. Chrome, Edge and Android get an Install
 *    button (the browser's own dialog follows); Safari on iPhone and iPad
 *    gets the three Share-menu steps in a sheet. On iPhone this comes before
 *    the push question, because push works only in the installed app.
 *  - "settings": the same, always, with the installed state.
 *
 * Labels arrive as props (no message bundle in the browser).
 */
export function InstallPrompt({ labels, mode }: { labels: InstallLabels; mode: "card" | "settings" }) {
  const way = useSyncExternalStore(subscribeInstall, currentInstallWay, getServerWay);
  const snoozed = useSyncExternalStore(subscribeInstall, snoozedNow, getServerSnoozed);
  const [dismissed, setDismissed] = useState(false);
  const hidden = snoozed || dismissed;
  const [sheet, setSheet] = useState(false);
  const [message, setMessage] = useState("");

  const install = async () => {
    if (await promptInstall()) setMessage(labels.installedNow);
  };

  const notNow = () => {
    snooze();
    setDismissed(true);
  };

  const status = (
    // Polite, without role="status": the check-in pages already have one.
    <p className="ui-hint" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );

  const iosSheet = (
    <Dialog open={sheet} onOpenChange={setSheet} title={labels.iosTitle} closeLabel={labels.close} variant="sheet">
      <ol className="push-steps install-steps" data-testid="ios-install-steps">
        <li>
          <Share aria-hidden="true" className="install-steps__icon" />
          <span>{labels.iosStep1}</span>
        </li>
        <li>{labels.iosStep2}</li>
        <li>{labels.iosStep3}</li>
      </ol>
    </Dialog>
  );

  if (mode === "card") {
    if (hidden || (way !== "prompt" && way !== "ios")) return status;
    return (
      <section className="ui-card install-card" aria-labelledby="install-card-title" data-testid="install-card">
        <div className="grid gap-3">
          <h2 id="install-card-title" className="profile-section__title">
            <Smartphone aria-hidden="true" className="push-explainer__icon" />
            {way === "ios" ? labels.iosTitle : labels.title}
          </h2>
          <p className="text-muted">{way === "ios" ? labels.iosBody : labels.body}</p>
          <div className="alerts-toolbar">
            {way === "ios" ? (
              <Button onClick={() => setSheet(true)}>{labels.iosShow}</Button>
            ) : (
              <Button onClick={() => void install()}>{labels.install}</Button>
            )}
            <Button variant="ghost" onClick={notNow}>
              {labels.notNow}
            </Button>
          </div>
          {status}
        </div>
        {way === "ios" ? iosSheet : null}
      </section>
    );
  }

  return (
    <div className="grid gap-3" data-testid="install-settings">
      {way === "installed" ? (
        <p>{labels.installed}</p>
      ) : way === "prompt" ? (
        <>
          <p>{labels.body}</p>
          <div>
            <Button onClick={() => void install()}>{labels.install}</Button>
          </div>
        </>
      ) : way === "ios" ? (
        <>
          <p>{labels.iosBody}</p>
          <div>
            <Button variant="secondary" onClick={() => setSheet(true)}>
              {labels.iosShow}
            </Button>
          </div>
          {iosSheet}
        </>
      ) : (
        <p>{labels.unavailable}</p>
      )}
      {status}
    </div>
  );
}
