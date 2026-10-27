import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  chooseStoryMode,
  killSwitchOn,
  particleCount,
  pinnedSceneWindow,
  pixelRatio,
  type StoryEnv,
  storyProgress,
} from "../features/marketing/story/gates";

const root = join(__dirname, "../..");
const allowed: StoryEnv = {
  killSwitch: false,
  reducedMotion: false,
  webgl: true,
  deviceMemory: 8,
  saveData: false,
  fits: true,
};

describe("which story a visitor gets (D-121)", () => {
  it("gives the 3D story only when everything allows it", () => {
    expect(chooseStoryMode(allowed)).toBe("3d");
    expect(chooseStoryMode({ ...allowed, deviceMemory: undefined })).toBe("3d");
    expect(chooseStoryMode({ ...allowed, deviceMemory: 4 })).toBe("3d");
  });

  it("falls back to the static story", () => {
    expect(chooseStoryMode({ ...allowed, killSwitch: true })).toBe("static");
    expect(chooseStoryMode({ ...allowed, webgl: false })).toBe("static");
    expect(chooseStoryMode({ ...allowed, deviceMemory: 2 })).toBe("static");
    expect(chooseStoryMode({ ...allowed, deviceMemory: 1 })).toBe("static");
    expect(chooseStoryMode({ ...allowed, saveData: true })).toBe("static");
    expect(chooseStoryMode({ ...allowed, fits: false })).toBe("static");
  });

  it("keeps only simple fades under reduced motion, and the kill switch wins over everything", () => {
    expect(chooseStoryMode({ ...allowed, reducedMotion: true })).toBe("fade");
    expect(chooseStoryMode({ ...allowed, reducedMotion: true, webgl: false })).toBe("fade");
    expect(chooseStoryMode({ ...allowed, reducedMotion: true, killSwitch: true })).toBe("static");
  });

  it("reads the kill switch as off only when it says off", () => {
    expect(killSwitchOn("off")).toBe(true);
    expect(killSwitchOn(" OFF ")).toBe(true);
    expect(killSwitchOn(undefined)).toBe(false);
    expect(killSwitchOn("")).toBe(false);
    expect(killSwitchOn("on")).toBe(false);
  });
});

describe("the scene's budgets (§8)", () => {
  it("uses about 4,000 particles, and 2,000 on small screens", () => {
    expect(particleCount(1280)).toBe(4000);
    expect(particleCount(768)).toBe(4000);
    expect(particleCount(390)).toBe(2000);
  });

  it("caps the pixel ratio at 2 (1.5 on small screens)", () => {
    expect(pixelRatio(3, 1280)).toBe(2);
    expect(pixelRatio(1, 1280)).toBe(1);
    expect(pixelRatio(3, 390)).toBe(1.5);
    expect(pixelRatio(0, 390)).toBe(1);
  });
});

describe("one progress value for the whole story", () => {
  it("runs from 0 at night to 1 at dawn, in order, and back again", () => {
    expect(storyProgress(0, 0, 0)).toBe(0);
    expect(storyProgress(1, 0, 0)).toBeCloseTo(0.1);
    expect(storyProgress(1, 0.5, 0)).toBeCloseTo(0.475);
    expect(storyProgress(1, 1, 0)).toBeCloseTo(0.85);
    expect(storyProgress(1, 1, 1)).toBe(1);
    expect(storyProgress(0.5, 0, 0)).toBeCloseTo(0.05);
    let last = -1;
    for (const [h, p, d] of [
      [0, 0, 0],
      [0.5, 0, 0],
      [1, 0.2, 0],
      [1, 0.8, 0],
      [1, 1, 0.3],
      [1, 1, 1],
    ] as const) {
      const value = storyProgress(h, p, d);
      expect(value).toBeGreaterThan(last);
      last = value;
    }
  });

  it("gives each pinned scene a quarter of the pin", () => {
    expect(pinnedSceneWindow(0)).toEqual([0, 0.25]);
    expect(pinnedSceneWindow(3)).toEqual([0.75, 1]);
  });
});

describe("the story stays out of the app", () => {
  const read = (path: string) => readFileSync(join(root, path), "utf8");

  it("only the landing page entry imports the story", () => {
    expect(read("src/features/marketing/index.ts")).not.toContain("./components/landing");
    expect(read("src/features/marketing/ui-landing.ts")).toContain("./components/landing");
    expect(read("src/app/[locale]/(public)/page.tsx")).toContain("@/features/marketing/ui-landing");
  });

  it("loads three.js, GSAP and Lenis only through dynamic imports", () => {
    const enhancer = read("src/features/marketing/story/story-enhancer.tsx");
    expect(enhancer).toContain('import("./scroll-story")');
    expect(enhancer).not.toMatch(/from "(three|gsap|lenis)/);
    expect(enhancer).not.toMatch(/import .*["']\.\/(scroll-story|hero-scene)["']/);
    const story = read("src/features/marketing/story/scroll-story.ts");
    expect(story).toContain('import("./hero-scene")');
    expect(story).not.toMatch(/^import .*from "three"/m);
    // A type-only import is erased at build time.
    expect(story).not.toMatch(/^import (?!type ).*from "\.\/hero-scene"/m);
  });
});
