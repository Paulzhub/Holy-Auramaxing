/**
 * The scroll story's motion (CLAUDE.md §8, storyboard D-118, D-121): GSAP
 * ScrollTrigger drives one progress value through the hero, the pinned
 * scenes 2–5 and dawn; SplitText reveals the headlines; Lenis smooths the
 * scroll. The three.js scene (`hero-scene.ts`) follows that value.
 *
 * It only ever enhances the server HTML in `[data-story]`: no words change,
 * every scene stays in the page and in the accessibility tree (opacity only,
 * never `visibility` or `display`), and `stop()` puts everything back.
 *
 * Loaded with a dynamic import by `story-enhancer.tsx`, after the page has
 * painted and gone idle, and only when `chooseStoryMode()` says "3d".
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

import { pinnedSceneWindow, storyProgress } from "./gates";
import type { HeroScene } from "./hero-scene";

gsap.registerPlugin(ScrollTrigger, SplitText);

export interface StoryOptions {
  particles: number;
  pixelRatio: number;
  /** The device couldn't keep up: the caller stops the story and keeps the static one. */
  onSlow: () => void;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Start the story on `root` (the `[data-story]` element). Resolves with a
 * function that undoes everything, or with `null` if the page was left (or
 * the scene couldn't start) before it was ready.
 */
export async function startStory(
  root: HTMLElement,
  options: StoryOptions,
  signal: AbortSignal,
): Promise<(() => void) | null> {
  const pin = root.querySelector<HTMLElement>("[data-story-pin]");
  const hero = root.querySelector<HTMLElement>('[data-scene="hero"]');
  const dawn = root.querySelector<HTMLElement>('[data-scene="dawn"]');
  if (!pin || !hero || !dawn) return null;
  const pinned = Array.from(pin.querySelectorAll<HTMLElement>(":scope > .story-scene"));

  // The three.js scene is its own chunk, loaded one frame later, so the two
  // big scripts are evaluated in separate tasks.
  await nextFrame();
  const { createHeroScene } = await import("./hero-scene");
  if (signal.aborted) return null;

  let scene: HeroScene;
  try {
    scene = await createHeroScene(root, options);
  } catch {
    return null; // No WebGL after all: the static story stays.
  }
  if (signal.aborted) {
    scene.destroy();
    return null;
  }

  // ---- Swap the still pictures for the canvas.
  const ctx = gsap.context(() => {}, root);
  root.classList.add("story--3d");
  root.dataset.storyMode = "3d";
  await nextFrame();
  root.classList.add("story--lit");

  // ---- One progress value from three scroll segments.
  const seg = { hero: 0, pinned: 0, dawn: 0 };
  const update = () => scene.setProgress(storyProgress(seg.hero, seg.pinned, seg.dawn));

  const splits: SplitText[] = [];
  const lenis = new Lenis({ autoRaf: false, anchors: true });
  const raf = (time: number) => lenis.raf(time * 1000);

  ctx.add(() => {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Scene 1: the headline lifts in word by word. The words are already
    // there (and stay readable to screen readers: aria "auto").
    const title = hero.querySelector<HTMLElement>("h1");
    if (title) {
      const split = SplitText.create(title, { type: "words", aria: "auto" });
      splits.push(split);
      gsap.from(split.words, { opacity: 0.25, y: "0.2em", duration: 0.7, stagger: 0.06, ease: "power2.out" });
    }

    ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom top",
      onUpdate: (self) => {
        seg.hero = self.progress;
        update();
      },
    });

    // Scenes 2–5: one pinned section, about 400vh of scrolling, scrubbed.
    const tl = gsap.timeline({ defaults: { ease: "none" } });
    pinned.forEach((section, i) => {
      const [from, to] = pinnedSceneWindow(i, pinned.length).map((v) => v * pinned.length);
      const heading = section.querySelector<HTMLElement>("h2");
      const words = heading ? SplitText.create(heading, { type: "words", aria: "auto" }) : null;
      if (words) splits.push(words);
      const inner = section.querySelector<HTMLElement>(".story-scene__inner");
      const rest = inner
        ? Array.from(inner.children).filter((el) => el !== heading && !el.classList.contains("story-art"))
        : [];

      const parts = [...(words?.words ?? []), ...rest];
      if (i === 0) {
        // The weight fades up line by line as it scrolls in, before the pin.
        gsap.fromTo(
          parts,
          { opacity: 0, y: 24 },
          {
            opacity: 1,
            y: 0,
            stagger: 0.05,
            ease: "none",
            scrollTrigger: { trigger: pin, start: "top 80%", end: "top 15%", scrub: 0.6 },
          },
        );
      } else {
        tl.fromTo(section, { opacity: 0 }, { opacity: 1, duration: 0.12 }, from! - 0.06);
        tl.fromTo(parts, { opacity: 0, y: 24 }, { opacity: 1, y: 0, stagger: 0.03, duration: 0.24 }, from!);
      }
      if (i < pinned.length - 1) tl.to(section, { opacity: 0, y: -28, duration: 0.14 }, to! - 0.14);
    });
    // The timeline spans exactly the pinned scroll, one unit per scene.
    tl.set({}, {}, pinned.length);

    ScrollTrigger.create({
      trigger: pin,
      start: "top top",
      end: () => `+=${(pinned.length - 1) * 100}%`,
      pin: true,
      scrub: 0.6,
      animation: tl,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        seg.pinned = self.progress;
        update();
      },
    });

    // Scene 6: dawn scrolls in over the canvas and the sun rises.
    ScrollTrigger.create({
      trigger: dawn,
      start: "top bottom",
      end: "top top",
      onUpdate: (self) => {
        seg.dawn = self.progress;
        update();
      },
    });
    const sun = dawn.querySelector(".story-art__sun, .story-art--dawn");
    if (sun) {
      gsap.fromTo(
        sun,
        { y: 40, opacity: 0.4 },
        {
          y: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: { trigger: dawn, start: "top 90%", end: "center center", scrub: true },
        },
      );
    }

    // Draw only while the story is on screen and the tab is visible.
    ScrollTrigger.create({
      trigger: root,
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => scene.setActive(self.isActive && document.visibilityState === "visible"),
    });
  });

  const onVisibility = () => {
    const rect = root.getBoundingClientRect();
    const onScreen = rect.bottom > 0 && rect.top < window.innerHeight;
    scene.setActive(onScreen && document.visibilityState === "visible");
  };
  const onResize = () => scene.resize();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("resize", onResize);
  ScrollTrigger.refresh();
  onVisibility();

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("resize", onResize);
    gsap.ticker.remove(raf);
    gsap.ticker.lagSmoothing(500, 33);
    lenis.destroy();
    // Reverts every tween, ScrollTrigger and pin made inside the context.
    ctx.revert();
    for (const split of splits) split.revert();
    scene.destroy();
    root.classList.remove("story--3d", "story--lit");
    delete root.dataset.storyMode;
  };
}
