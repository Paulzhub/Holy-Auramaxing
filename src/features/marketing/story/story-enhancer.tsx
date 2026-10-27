"use client";

import { useEffect } from "react";

import { chooseStoryMode, killSwitchOn, particleCount, pixelRatio, type StoryMode } from "./gates";

/**
 * Enhances the landing page's scroll story (`[data-story]`) once the page has
 * painted (CLAUDE.md §8, D-121). It renders nothing. The story's words are
 * server HTML and the hero's h1 is the largest paint, so nothing here can
 * delay it.
 *
 * After `load` and an idle moment it decides which story this visitor gets:
 * - "3d": loads `scroll-story.ts` (GSAP, SplitText, Lenis), which loads the
 *   three.js scene, at the visitor's first sign of intent: a scroll, wheel,
 *   touch, key or mouse movement. Until then the still chain is showing, so
 *   a visitor who only reads the first screen never downloads or runs the
 *   3D, and it never competes with the first paint or first input (§8, §12).
 * - "fade" (reduced motion): scenes below the fold fade in, opacity only.
 * - "static": nothing happens.
 */
export function StoryEnhancer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-story]");
    if (!root) return;

    const controller = new AbortController();
    let undo: (() => void) | null = null;
    const waits: Array<() => void> = [];

    const start3d = () => {
      if (controller.signal.aborted) return;
      // Creating a WebGL context costs real time on some devices, so we only
      // check for one now, at the visitor's first intent.
      if (!hasWebGL2()) {
        root.dataset.storyReady = "static";
        return;
      }
      root.dataset.storyReady = "loading";
      void import("./scroll-story")
        .then(({ startStory }) => {
          const width = window.innerWidth;
          return startStory(
            root,
            {
              particles: particleCount(width),
              pixelRatio: pixelRatio(window.devicePixelRatio, width),
              onSlow: () => {
                undo?.();
                undo = null;
                root.dataset.storyReady = "static";
              },
            },
            controller.signal,
          );
        })
        .then((stop) => {
          if (controller.signal.aborted) {
            stop?.();
          } else {
            undo = stop;
            root.dataset.storyReady = stop ? "3d" : "static";
          }
        })
        .catch(() => {
          // The static story is already on the page; nothing else to do.
          root.dataset.storyReady = "static";
        });
    };

    const begin = () => {
      if (controller.signal.aborted) return;
      const mode = currentMode(root);
      root.dataset.storyReady = mode === "3d" ? "waiting" : mode;
      if (mode === "fade") undo = fadeScenes(root);
      else if (mode === "3d") waits.push(onFirstIntent(start3d));
    };

    waits.push(afterLoadAndIdle(begin));

    return () => {
      controller.abort();
      for (const cancel of waits) cancel();
      undo?.();
      delete root.dataset.storyReady;
    };
  }, []);

  return null;
}

/**
 * Call `fn` once, at the visitor's first scroll, wheel, touch, key press or
 * mouse movement (or at once if the page is already scrolled, e.g. after a
 * reload halfway down).
 */
function onFirstIntent(fn: () => void): () => void {
  const events = ["scroll", "wheel", "touchstart", "pointerdown", "pointermove", "keydown"] as const;
  let done = false;
  const fire = (event?: Event) => {
    if (done) return;
    // A pen or finger hovering isn't intent; a mouse moving is.
    if (event?.type === "pointermove" && (event as PointerEvent).pointerType !== "mouse") return;
    done = true;
    cancel();
    fn();
  };
  const cancel = () => {
    for (const type of events) window.removeEventListener(type, fire);
  };
  if (window.scrollY > 0) {
    fire();
    return () => {};
  }
  for (const type of events) window.addEventListener(type, fire, { passive: true });
  return cancel;
}

function currentMode(root: HTMLElement): StoryMode {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return chooseStoryMode({
    killSwitch: killSwitchOn(process.env.NEXT_PUBLIC_LANDING_3D),
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    // Checked later, at first intent (start3d), because creating a context isn't free.
    webgl: true,
    deviceMemory: nav.deviceMemory,
    saveData: nav.connection?.saveData === true,
    fits: scenesFit(root),
  });
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * The pinned scenes are stacked on one screen, so each must fit, with room
 * to spare, at the visitor's window size, zoom and text size.
 */
function scenesFit(root: HTMLElement): boolean {
  const room = window.innerHeight * 0.78;
  if (window.innerWidth < 320) return false;
  return Array.from(root.querySelectorAll<HTMLElement>("[data-story-pin] .story-scene__inner")).every(
    (inner) => inner.getBoundingClientRect().height <= room,
  );
}

/** Run `fn` after the window's load event and the browser's next idle moment. */
function afterLoadAndIdle(fn: () => void): () => void {
  let idle = 0;
  let timer = 0;
  const idleThen = () => {
    // Safari has no requestIdleCallback yet.
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(fn, { timeout: 2500 });
    else timer = window.setTimeout(fn, 600);
  };
  if (document.readyState === "complete") idleThen();
  else window.addEventListener("load", idleThen, { once: true });
  return () => {
    window.removeEventListener("load", idleThen);
    if (idle) window.cancelIdleCallback(idle);
    if (timer) window.clearTimeout(timer);
  };
}

/** Reduced motion: scenes not yet on screen fade in when they arrive (opacity only). */
function fadeScenes(root: HTMLElement): () => void {
  const scenes = Array.from(root.querySelectorAll<HTMLElement>(".story-scene")).filter(
    (s) => s.getBoundingClientRect().top > window.innerHeight,
  );
  if (scenes.length === 0 || !("IntersectionObserver" in window)) return () => {};
  for (const s of scenes) s.classList.add("story-scene--waiting");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove("story-scene--waiting");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  for (const s of scenes) observer.observe(s);
  return () => {
    observer.disconnect();
    for (const s of scenes) s.classList.remove("story-scene--waiting");
  };
}
