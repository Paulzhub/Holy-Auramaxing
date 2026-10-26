"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";

import { Button } from "@/components/ui/button";

import { BREATH_PHASES, BREATH_ROUNDS, formatClock, SOS_CARDS, WAVE_SECONDS, type BreathPhase } from "../constants";

/**
 * The SOS sheet's own tools (CLAUDE.md §7.9), which need no connection: the
 * breathing guide, the Scripture cards and the "ride the wave" timer. The
 * same pieces make up the offline page (/breathe).
 *
 * Accessibility (§9, D-106): nothing starts by itself and everything can be
 * paused; under reduced motion the circle stays still and the words step on
 * instead; screen readers hear one polite line per breath and the timer only
 * at five minutes, one minute and the end, through the sheet's single live
 * region (never a second role="status").
 */

export type Announce = (text: string) => void;

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** One polite live region for a whole sheet or page. */
export function useAnnouncer(): [string, Announce] {
  const [message, setMessage] = useState("");
  const announce = useCallback<Announce>((text) => {
    // Clear first, so the same words twice are still read out.
    setMessage("");
    window.setTimeout(() => setMessage(text), 50);
  }, []);
  return [message, announce];
}

export function LiveLine({ message }: { message: string }) {
  return (
    <p className="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="sos-live">
      {message}
    </p>
  );
}

// ---------------------------------------------------------------- breathing

type BreathState = { status: "idle" | "running" | "paused" | "done"; phase: number; round: number; left: number };

const START: BreathState = { status: "idle", phase: 0, round: 1, left: BREATH_PHASES[0].seconds };

function step(s: BreathState): BreathState {
  const nextPhase = s.phase + 1;
  if (nextPhase < BREATH_PHASES.length) return { ...s, phase: nextPhase, left: BREATH_PHASES[nextPhase]!.seconds };
  if (s.round >= BREATH_ROUNDS) return { ...s, status: "done", left: 0 };
  return { ...s, phase: 0, round: s.round + 1, left: BREATH_PHASES[0].seconds };
}

export function Breathing({ announce }: { announce: Announce }) {
  const t = useTranslations("sos.breathing");
  const reduced = useReducedMotion();
  const [s, setS] = useState<BreathState>(START);
  const key: BreathPhase = BREATH_PHASES[s.phase]!.key;

  useEffect(() => {
    if (s.status !== "running") return;
    const id = window.setInterval(() => {
      setS((prev) => (prev.left > 1 ? { ...prev, left: prev.left - 1 } : step(prev)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [s.status]);

  // One polite line per breath, and one at the end: not every few seconds.
  const lastRound = useRef(0);
  useEffect(() => {
    if (s.status === "done") {
      announce(t("done"));
      lastRound.current = 0;
    } else if (s.status === "running" && s.phase === 0 && s.round !== lastRound.current) {
      lastRound.current = s.round;
      announce(`${t("round", { current: s.round, total: BREATH_ROUNDS })}. ${t("in")}.`);
    }
  }, [s.status, s.phase, s.round, announce, t]);

  const moving = s.status === "running" && !reduced;
  return (
    <section className="sos-section" aria-labelledby="sos-breathing-title">
      <h3 id="sos-breathing-title" className="sos-section__title">
        {t("heading")}
      </h3>
      <p>{t("body")}</p>
      <div className="breath" data-phase={s.status === "done" || s.status === "idle" ? "rest" : key}>
        <div
          className={`breath__circle${moving ? "breath__circle--moving" : ""}`}
          style={moving ? { animationDuration: `${BREATH_PHASES[s.phase]!.seconds}s` } : undefined}
          aria-hidden="true"
          key={moving ? `${s.round}-${s.phase}` : "still"}
        />
        <p className="breath__words" data-testid="breath-words">
          {s.status === "idle" ? null : s.status === "done" ? (
            t("done")
          ) : (
            <>
              <strong>{t(key)}</strong>
              <span>{t("round", { current: s.round, total: BREATH_ROUNDS })}</span>
            </>
          )}
        </p>
      </div>
      <div className="sos-buttons">
        {s.status === "idle" || s.status === "done" ? (
          <Button variant="secondary" onClick={() => setS({ ...START, status: "running" })}>
            {s.status === "done" ? t("again") : t("start")}
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => setS((p) => ({ ...p, status: p.status === "running" ? "paused" : "running" }))}
            >
              {s.status === "running" ? t("pause") : t("resume")}
            </Button>
            {/* Step on by hand, at your own pace (useful under reduced motion, and never timed). */}
            <Button variant="ghost" onClick={() => setS((p) => step(p))}>
              {t("next")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Scripture cards

export function VerseCards() {
  const t = useTranslations("sos.cards");
  const [i, setI] = useState(0);
  const card = SOS_CARDS[i]!;
  const total = SOS_CARDS.length;
  return (
    <section className="sos-section" aria-labelledby="sos-cards-title">
      <h3 id="sos-cards-title" className="sos-section__title">
        {t("heading")}
      </h3>
      <figure className="verse sos-verse" aria-label={t("count", { current: i + 1, total })}>
        <blockquote>
          <p>{t(`${card}.text`)}</p>
        </blockquote>
        <figcaption>{t(`${card}.reference`)}</figcaption>
      </figure>
      <div className="sos-buttons sos-buttons--spread">
        <Button variant="ghost" onClick={() => setI((i - 1 + total) % total)} aria-label={t("previous")}>
          <ChevronLeft aria-hidden="true" />
          <span aria-hidden="true">{t("previous")}</span>
        </Button>
        <span className="text-muted" aria-hidden="true">
          {t("count", { current: i + 1, total })}
        </span>
        <Button variant="ghost" onClick={() => setI((i + 1) % total)} aria-label={t("next")}>
          <span aria-hidden="true">{t("next")}</span>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ride the wave

type WaveState =
  { status: "idle" | "stopped" | "done" } | { status: "running"; endsAt: number } | { status: "paused"; left: number };

/** What the sheet can do to the timer from elsewhere ("Go for a walk" starts it). */
export interface WaveTimerHandle {
  start: () => void;
}

/**
 * Ten minutes. Finishing counts one wave ridden out (onFinish); stopping early
 * is never a failure and never counted against anyone (grace, D-106).
 */
export function WaveTimer({
  announce,
  onFinish,
  ref,
}: {
  announce: Announce;
  onFinish?: () => void;
  ref?: Ref<WaveTimerHandle>;
}) {
  const t = useTranslations("sos.wave");
  const [s, setS] = useState<WaveState>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const said = useRef(new Set<number>());
  const latest = useRef({ announce, onFinish, t });
  useEffect(() => {
    latest.current = { announce, onFinish, t };
  });

  const start = useCallback(() => {
    said.current = new Set();
    setNow(Date.now());
    setS({ status: "running", endsAt: Date.now() + WAVE_SECONDS * 1000 });
  }, []);
  useImperativeHandle(ref, () => ({ start }), [start]);

  const endsAt = s.status === "running" ? s.endsAt : null;
  useEffect(() => {
    if (endsAt === null) return;
    const id = window.setInterval(() => {
      const at = Date.now();
      const secondsLeft = (endsAt - at) / 1000;
      const { announce: say, onFinish: finished, t: words } = latest.current;
      // Spoken only at five minutes, one minute and the end (never ticking aloud).
      for (const [mark, key] of [
        [300, "fiveLeft"],
        [60, "oneLeft"],
      ] as const) {
        if (secondsLeft <= mark && !said.current.has(mark)) {
          said.current.add(mark);
          if (secondsLeft > mark - 5) say(words(key));
        }
      }
      if (secondsLeft <= 0) {
        window.clearInterval(id);
        setS({ status: "done" });
        say(words("done"));
        finished?.();
      }
      setNow(at);
    }, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const left = s.status === "running" ? (s.endsAt - now) / 1000 : s.status === "paused" ? s.left : WAVE_SECONDS;

  const progress = Math.min(1, Math.max(0, 1 - left / WAVE_SECONDS));
  return (
    <section className="sos-section" aria-labelledby="sos-wave-title" id="sos-wave">
      <h3 id="sos-wave-title" className="sos-section__title">
        {t("heading")}
      </h3>
      <p>{t("body")}</p>
      {s.status === "running" || s.status === "paused" ? (
        <div className="wave">
          {/* The time is read when someone looks for it, never ticking aloud. */}
          <p className="wave__clock" role="timer" aria-live="off" data-testid="wave-clock">
            {t("remaining", { time: formatClock(left) })}
          </p>
          <div className="wave__bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          {s.status === "paused" ? <p className="text-muted">{t("paused")}</p> : null}
        </div>
      ) : null}
      {s.status === "done" ? <p className="sos-gentle">{t("done")}</p> : null}
      {s.status === "stopped" ? <p className="sos-gentle">{t("stopped")}</p> : null}
      <div className="sos-buttons">
        {s.status === "running" || s.status === "paused" ? (
          <>
            <Button
              variant="secondary"
              onClick={() =>
                setS(
                  s.status === "running"
                    ? { status: "paused", left }
                    : { status: "running", endsAt: Date.now() + left * 1000 },
                )
              }
            >
              {s.status === "running" ? t("pause") : t("resume")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setS({ status: "stopped" });
                announce(t("stopped"));
              }}
            >
              {t("stop")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={start}>
            {t("start")}
          </Button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the prayer and "already slipped?"

export function SosPrayer() {
  const t = useTranslations("sos");
  return (
    <section className="sos-section" aria-labelledby="sos-prayer-title">
      <h3 id="sos-prayer-title" className="sos-section__title">
        {t("prayerHeading")}
      </h3>
      <p>{t("prayer")}</p>
    </section>
  );
}

/** Someone may open SOS after a slip, out of shame rather than temptation (grace review 1, G-7). */
export function AfterSlip({ link }: { link?: ReactNode }) {
  const t = useTranslations("sos");
  return (
    <details className="sos-after-slip">
      <summary>{t("afterSlip")}</summary>
      <figure className="verse">
        <blockquote>
          <p>{t("afterSlipText")}</p>
        </blockquote>
        <figcaption>{t("afterSlipReference")}</figcaption>
      </figure>
      <p>{t("afterSlipNext")}</p>
      {link ? <p>{link}</p> : null}
    </details>
  );
}
