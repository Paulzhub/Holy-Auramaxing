/**
 * Whether and how this device can install the app (CLAUDE.md §13; D-127).
 *
 * Chrome, Edge and Android fire `beforeinstallprompt` once the app can be
 * installed; we keep that event (the browser's own mini-bar is suppressed)
 * and use it when the person presses our Install button. Safari on iPhone
 * and iPad has no such event: there, the person adds the app through the
 * Share menu, so we show the steps. Listening starts as soon as this file
 * is loaded, because the event can come before any component is ready.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallWay = "prompt" | "ios" | "installed" | "none";

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    changed();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone, iPad (which reports itself as a Mac) and iPod, in a browser tab. */
export function isAppleMobile(userAgent: string, touchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes("Macintosh") && touchPoints > 1);
}

/** Pure, for tests: which way this device can install the app. */
export function installWay(input: {
  standalone: boolean;
  installedNow: boolean;
  hasPrompt: boolean;
  appleMobile: boolean;
}): InstallWay {
  if (input.standalone || input.installedNow) return "installed";
  if (input.hasPrompt) return "prompt";
  if (input.appleMobile) return "ios";
  return "none";
}

export function currentInstallWay(): InstallWay {
  if (typeof window === "undefined") return "none";
  return installWay({
    standalone: isStandalone(),
    installedNow,
    hasPrompt: deferred !== null,
    appleMobile: isAppleMobile(navigator.userAgent, navigator.maxTouchPoints || 0),
  });
}

/** Shows the browser's own install dialog. True when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") installedNow = true;
    return choice.outcome === "accepted";
  } catch {
    return false;
  } finally {
    changed();
  }
}

// ---------------------------------------------------------------- "Not now"

const SNOOZE_KEY = "ha-install-snoozed";
export const SNOOZE_DAYS = 30;

export function isSnoozed(now: number = Date.now()): boolean {
  try {
    const until = Number(window.localStorage.getItem(SNOOZE_KEY) || 0);
    return until > now;
  } catch {
    return false;
  }
}

export function snooze(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // Private mode: it simply shows again next time.
  }
}
