"use client";

import { CircleCheck, Sunrise } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { sealedNoteContext, sealNote, type NoteKey } from "@/lib/offline/sealed-note";
import { SW_MESSAGES, SYNC_TAG } from "@/lib/pwa/constants";
import {
  isoWithOffset,
  openDays,
  queueId,
  type DeviceSession,
  type Outcome,
  type QueuedCheckin,
} from "@/lib/pwa/queue";
import { countWaiting, enqueue, getNoteKey, getSession } from "@/lib/pwa/store";

export interface Option {
  value: string;
  label: string;
}

export interface OfflineCheckinLabels {
  noSession: string;
  dayLegend: string;
  answerToday: string;
  answerYesterday: string;
  questionToday: string;
  questionYesterday: string;
  detailsSummary: string;
  detailsHint: string;
  moodLegend: string;
  moods: Option[];
  urgeLegend: string;
  urges: Option[];
  skip: string;
  triggersLegend: string;
  triggers: Option[];
  noteLabel: string;
  noteHint: string;
  noteSealed: string;
  noteOffline: string;
  honest: string;
  choicesLabel: string;
  cleanToday: string;
  cleanYesterday: string;
  slipped: string;
  saving: string;
  savedTitle: string;
  /** "… it will count for {day}." */
  savedBody: string;
  waitingOne: string;
  /** "{count} check-ins are waiting to be sent." */
  waitingMany: string;
  change: string;
  saveFailed: string;
  noDay: string;
  mercyTitle: string;
  mercyLede: string;
  mercyVerse: string;
  mercyReference: string;
  freeTitle: string;
  freeLede: string;
}

type Phase =
  | { kind: "loading" }
  | { kind: "noSession" }
  | { kind: "form"; session: DeviceSession; noteKey: NoteKey | null; days: string[] }
  | { kind: "saved"; outcome: Outcome; date: string; session: DeviceSession; noteKey: NoteKey | null; days: string[] };

function formatDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * Check in without a connection (CLAUDE.md §7.5, §13; D-124, D-126). The
 * page itself holds nobody's data (the service worker keeps a copy of it);
 * everything here comes from this device: who is signed in and their time
 * zone (saved by the app while online), and the server's public key for
 * sealing a private note (D-123).
 *
 * The answer goes into the device's queue with the day and the moment it
 * was made, and the service worker sends it when the connection returns.
 * The page says how many are waiting, never what they say.
 */
export function OfflineCheckin({ labels, locale }: { labels: OfflineCheckinLabels; locale: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<"today" | "yesterday">("today");
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    let active = true;
    void (async () => {
      const [session, noteKey] = await Promise.all([getSession(), getNoteKey()]);
      if (!active) return;
      if (!session) {
        setPhase({ kind: "noSession" });
        return;
      }
      setWaiting(await countWaiting(session.userId));
      setPhase({ kind: "form", session, noteKey, days: openDays(session.timeZone, new Date()) });
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (phase.kind === "saved") savedHeading.current?.focus();
  }, [phase.kind]);

  if (phase.kind === "loading") return null;
  if (phase.kind === "noSession") return <p className="auth-banner">{labels.noSession}</p>;

  const waitingLine =
    waiting === 0 ? null : (
      <p className="text-muted" data-testid="offline-waiting">
        {waiting === 1 ? labels.waitingOne : labels.waitingMany.replace("{count}", String(waiting))}
      </p>
    );

  if (phase.kind === "saved") {
    const slipped = phase.outcome === "slipped";
    return (
      <div className="stack-sm" data-testid="offline-saved">
        <div className="auth-banner auth-banner--success">
          <h2 ref={savedHeading} tabIndex={-1} className="profile-section__title">
            {labels.savedTitle}
          </h2>
          <p>{labels.savedBody.replace("{day}", formatDay(phase.date, locale))}</p>
        </div>
        {slipped ? (
          <section className="ui-card stack-sm" aria-labelledby={`${id}-mercy`}>
            <h2 id={`${id}-mercy`} className="profile-section__title">
              {labels.mercyTitle}
            </h2>
            <p>{labels.mercyLede}</p>
            <figure className="verse mercies__verse">
              <blockquote>
                <p>{labels.mercyVerse}</p>
              </blockquote>
              <figcaption>{labels.mercyReference}</figcaption>
            </figure>
          </section>
        ) : (
          <section className="ui-card stack-sm" aria-labelledby={`${id}-free`}>
            <h2 id={`${id}-free`} className="profile-section__title">
              {labels.freeTitle}
            </h2>
            <p>{labels.freeLede}</p>
          </section>
        )}
        {waitingLine}
        <div>
          <Button
            variant="secondary"
            onClick={() => setPhase({ kind: "form", session: phase.session, noteKey: phase.noteKey, days: phase.days })}
          >
            {labels.change}
          </Button>
        </div>
      </div>
    );
  }

  const { session, noteKey, days } = phase;
  if (!days.length) return <p className="auth-banner">{labels.noDay}</p>;
  const [today, yesterday] = days as [string, string | undefined];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const outcome = submitter?.value === "slipped" ? "slipped" : submitter?.value === "clean" ? "clean" : null;
    if (!outcome) return;
    const form = new FormData(event.currentTarget);
    const date =
      typeof form.get("date") === "string" && days.includes(String(form.get("date")))
        ? String(form.get("date"))
        : today;
    setBusy(true);
    setError("");
    try {
      const note = String(form.get("note") ?? "")
        .replace(/\r\n/g, "\n")
        .trim();
      const sealedNote =
        note && noteKey ? await sealNote(note, noteKey, sealedNoteContext(session.userId, date)) : null;
      const now = new Date();
      const item: QueuedCheckin = {
        id: queueId(now),
        userId: session.userId,
        localDate: date,
        recordedAt: isoWithOffset(now),
        outcome,
        mood: numberOrNull(form.get("mood")),
        urge: numberOrNull(form.get("urge")),
        triggers: form.getAll("triggers").filter((v): v is string => typeof v === "string"),
        sealedNote,
      };
      if (!(await enqueue(item))) throw new Error("not-kept");
      // Background Sync where the browser has it; the app also sends on its next open.
      const registration = await navigator.serviceWorker?.getRegistration("/").catch(() => undefined);
      const sync = (
        registration as (ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } }) | undefined
      )?.sync;
      await sync?.register(SYNC_TAG).catch(() => undefined);
      registration?.active?.postMessage(SW_MESSAGES.flush);
      setWaiting(await countWaiting(session.userId));
      setPhase({ kind: "saved", outcome, date, session, noteKey, days });
    } catch {
      setError(labels.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="checkin-form"
      aria-labelledby={`${id}-question`}
      onSubmit={(e) => void submit(e)}
      data-testid="offline-checkin"
    >
      <h2 id={`${id}-question`} className="checkin-question">
        {chosen === "yesterday" ? labels.questionYesterday : labels.questionToday}
      </h2>

      {yesterday ? (
        <fieldset className="checkin-scale">
          <legend>{labels.dayLegend}</legend>
          <div className="checkin-scale__options">
            <label className="checkin-pill">
              <input
                type="radio"
                name="date"
                value={today}
                checked={chosen === "today"}
                onChange={() => setChosen("today")}
              />
              <span>{labels.answerToday}</span>
            </label>
            <label className="checkin-pill">
              <input
                type="radio"
                name="date"
                value={yesterday}
                checked={chosen === "yesterday"}
                onChange={() => setChosen("yesterday")}
              />
              <span>{labels.answerYesterday}</span>
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="date" value={today} />
      )}

      <details className="checkin-details">
        <summary>{labels.detailsSummary}</summary>
        <div className="checkin-details__body">
          <p className="text-muted">{labels.detailsHint}</p>
          <fieldset className="checkin-scale">
            <legend>{labels.moodLegend}</legend>
            <div className="checkin-scale__options">
              {labels.moods.map((m) => (
                <label key={m.value} className="checkin-pill">
                  <input type="radio" name="mood" value={m.value} />
                  <span>{m.label}</span>
                </label>
              ))}
              <label className="checkin-pill checkin-pill--quiet">
                <input type="radio" name="mood" value="" defaultChecked />
                <span>{labels.skip}</span>
              </label>
            </div>
          </fieldset>
          <fieldset className="checkin-scale">
            <legend>{labels.urgeLegend}</legend>
            <div className="checkin-scale__options">
              {labels.urges.map((u) => (
                <label key={u.value} className="checkin-pill">
                  <input type="radio" name="urge" value={u.value} />
                  <span>{u.label}</span>
                </label>
              ))}
              <label className="checkin-pill checkin-pill--quiet">
                <input type="radio" name="urge" value="" defaultChecked />
                <span>{labels.skip}</span>
              </label>
            </div>
          </fieldset>
          <fieldset className="checkin-scale">
            <legend>{labels.triggersLegend}</legend>
            <div className="checkin-scale__options">
              {labels.triggers.map((tr) => (
                <label key={tr.value} className="checkin-pill">
                  <input type="checkbox" name="triggers" value={tr.value} />
                  <span>{tr.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {noteKey ? (
            <div className="ui-field">
              <label htmlFor={`${id}-note`} className="ui-field__label">
                {labels.noteLabel}
              </label>
              <p id={`${id}-note-hint`} className="ui-field__hint">
                {labels.noteSealed}
              </p>
              <textarea
                id={`${id}-note`}
                name="note"
                className="ui-input checkin-note"
                rows={4}
                maxLength={1000}
                aria-describedby={`${id}-note-hint`}
                autoComplete="off"
                spellCheck
              />
            </div>
          ) : (
            <p className="text-muted">{labels.noteOffline}</p>
          )}
        </div>
      </details>

      <p className="checkin-honest">{labels.honest}</p>
      <div className="checkin-choices" role="group" aria-label={labels.choicesLabel}>
        <button
          type="submit"
          name="outcome"
          value="clean"
          className="checkin-choice checkin-choice--clean"
          aria-disabled={busy || undefined}
        >
          <span className="checkin-choice__icon" aria-hidden="true">
            <CircleCheck />
          </span>
          <span className="checkin-choice__label">
            {busy ? labels.saving : chosen === "yesterday" ? labels.cleanYesterday : labels.cleanToday}
          </span>
        </button>
        <button
          type="submit"
          name="outcome"
          value="slipped"
          className="checkin-choice checkin-choice--slipped"
          aria-disabled={busy || undefined}
        >
          <span className="checkin-choice__icon" aria-hidden="true">
            <Sunrise />
          </span>
          <span className="checkin-choice__label">{busy ? labels.saving : labels.slipped}</span>
        </button>
      </div>
      {error ? (
        <p className="auth-banner auth-banner--error" role="alert">
          {error}
        </p>
      ) : null}
      {waitingLine}
    </form>
  );
}
