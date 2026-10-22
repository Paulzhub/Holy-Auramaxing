"use client";

import { useEffect } from "react";

/** A page's result notice (the ?notice banners), or an element the page marks itself. */
export const ARRIVAL_SELECTOR =
  "main [data-arrival-focus], main .auth-banner[role='status'], main .auth-banner[role='alert']";

/** How long to watch after a form is sent, and how often to look. */
const WATCH_MS = 10_000;
const TICK_MS = 150;

function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || active === document.documentElement;
}

/** Focuses an element that may not be focusable on its own, without a stray tab stop. */
export function focusQuietly(el: HTMLElement) {
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center" });
}

/**
 * Where focus should go once a sent form's page has come back: a notice
 * that wasn't there before the form was sent, else (only if focus was lost)
 * any notice, else the page's main heading.
 */
export function arrivalTarget(before: ReadonlySet<Element>, lost: boolean): HTMLElement | null {
  const notices = Array.from(document.querySelectorAll<HTMLElement>(ARRIVAL_SELECTOR));
  const fresh = notices.find((el) => !before.has(el));
  if (fresh) return fresh;
  if (!lost) return null;
  return notices[0] ?? document.querySelector<HTMLElement>("main h1");
}

/**
 * Accessibility review 2 (A2-3, A2-4; WCAG 2.4.3 and 4.1.3). Most of the
 * app's forms are server actions that come back as a new page, often the
 * same address with a short notice ("Saved.", "Nudge sent."). The button
 * that was pressed is usually gone by then, so focus fell back to the top
 * of the document and a screen reader said nothing about the result.
 *
 * After any form is sent, this waits for the page to settle and then moves
 * focus to the new notice (which reads it out), or, if focus was lost and
 * there is no notice, to the page's main heading. It does nothing when the
 * person has already moved on, or when focus stayed somewhere sensible and
 * no new notice appeared (forms that report inline, like the wall's).
 * Without JavaScript the page simply loads from the top, as before.
 */
export function FocusAfterAction() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let lostTicks = 0;
    let watch = 0;

    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.closest("[data-keep-focus]")) return;
      const submitter = (event.submitter as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
      const before = new Set(document.querySelectorAll(ARRIVAL_SELECTOR));
      const started = Date.now();
      const id = ++watch;
      let seen: HTMLElement | null = null;
      lostTicks = 0;
      stop();
      timer = setInterval(() => {
        if (Date.now() - started > WATCH_MS) return stop();
        const lost = focusLost();
        lostTicks = lost ? lostTicks + 1 : 0;
        const target = arrivalTarget(before, lostTicks >= 2);
        // Seen on two ticks in a row, so the page's own focus handling
        // (FocusOnArrival) gets the first go.
        if (target && target === seen) {
          stop();
          if (document.activeElement !== target) focusQuietly(target);
        }
        seen = target;
      }, TICK_MS);
      // The person moving on (a click, Tab) ends the watch.
      const moveOn = (e: Event) => {
        if (e.target === submitter || e.target === document.body) return;
        if (id === watch) stop();
        document.removeEventListener("focusin", moveOn, true);
      };
      document.addEventListener("focusin", moveOn, true);
      setTimeout(() => document.removeEventListener("focusin", moveOn, true), WATCH_MS);
    };

    document.addEventListener("submit", onSubmit, true);
    return () => {
      stop();
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);
  return null;
}
