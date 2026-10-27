/**
 * Which version of the scroll story a visitor gets (CLAUDE.md §8, D-121).
 *
 * - "3d": the three.js scene, pinned scenes, SplitText and Lenis.
 * - "fade": reduced motion. The static story, with each scene fading in
 *   (opacity only) as it scrolls into view.
 * - "static": the server HTML exactly as it is. Also what readers without
 *   JavaScript and every crawler get.
 *
 * Pure, so the rules are tested without a browser (`story.test.ts`).
 */

export type StoryMode = "3d" | "fade" | "static";

export interface StoryEnv {
  /** `NEXT_PUBLIC_LANDING_3D=off`: the kill switch (§14). */
  killSwitch: boolean;
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
  /** A WebGL 2 context could be created. */
  webgl: boolean;
  /** `navigator.deviceMemory` in GB, where the browser tells us. */
  deviceMemory: number | undefined;
  /** `navigator.connection.saveData`. */
  saveData: boolean;
  /**
   * Every pinned scene fits on one screen. When it doesn't (a short window,
   * 200% zoom, large text), stacking the scenes would cut words off, so the
   * page keeps the normal sections instead (WCAG 1.4.4, 1.4.10).
   */
  fits: boolean;
}

/** Devices with this much memory or less get the static story (§8). */
export const LOW_MEMORY_GB = 2;

export function chooseStoryMode(env: StoryEnv): StoryMode {
  if (env.killSwitch) return "static";
  if (env.reducedMotion) return "fade";
  if (!env.webgl) return "static";
  if (env.deviceMemory !== undefined && env.deviceMemory <= LOW_MEMORY_GB) return "static";
  if (env.saveData) return "static";
  if (!env.fits) return "static";
  return "3d";
}

/** The kill switch reads the build-time value; anything but "off" leaves 3D on. */
export function killSwitchOn(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "off";
}

/**
 * Fewer particles on small screens (storyboard scene 5): about 4,000, and
 * 2,000 below 768 px.
 */
export function particleCount(viewportWidth: number): number {
  return viewportWidth < 768 ? 2000 : 4000;
}

/** The device pixel ratio, capped at 2 (§8), and at 1.5 on small screens. */
export function pixelRatio(devicePixelRatio: number, viewportWidth: number): number {
  const cap = viewportWidth < 768 ? 1.5 : 2;
  return Math.max(1, Math.min(devicePixelRatio || 1, cap));
}

/**
 * The story's single progress value, 0 to 1, from the three scroll segments:
 * the hero scrolling away (0 → 0.1), the pinned scenes 2–5 (0.1 → 0.85) and
 * dawn arriving (0.85 → 1). Each input is that segment's own 0–1 progress.
 */
export const SEGMENTS = { hero: [0, 0.1], pinned: [0.1, 0.85], dawn: [0.85, 1] } as const;

export function storyProgress(hero: number, pinned: number, dawn: number): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const lerp = ([a, b]: readonly [number, number], t: number) => a + (b - a) * clamp(t);
  if (clamp(dawn) > 0) return lerp(SEGMENTS.dawn, dawn);
  if (clamp(pinned) > 0) return lerp(SEGMENTS.pinned, pinned);
  return lerp(SEGMENTS.hero, hero);
}

/** Where scene `i` (0 = the weight … 3 = into light) sits inside the pinned segment. */
export function pinnedSceneWindow(i: number, count = 4): [number, number] {
  return [i / count, (i + 1) / count];
}
