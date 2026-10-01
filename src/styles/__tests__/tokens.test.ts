import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/test/contrast";

const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

function tokensIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--(color-[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    out[match[1] as string] = (match[2] as string).toLowerCase();
  }
  return out;
}

function between(start: string, end: string): string {
  const from = css.indexOf(start);
  const to = css.indexOf(end, from);
  expect(from, `marker ${start}`).toBeGreaterThan(-1);
  return css.slice(from, to);
}

const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf(':root[data-theme="light"]'));
const light = tokensIn(lightBlock);
const darkPinned = tokensIn(between("/* DARK:BEGIN pinned */", "/* DARK:END pinned */"));
const darkSystem = tokensIn(between("/* DARK:BEGIN system */", "/* DARK:END system */"));
const dark = { ...light, ...darkPinned };

// [foreground, background, minimum ratio]
// 4.5 = body text, 3 = large text and UI parts (WCAG 1.4.3 / 1.4.11).
const pairs: [string, string, number][] = [
  ["color-ink", "color-bg", 4.5],
  ["color-ink", "color-surface", 4.5],
  ["color-ink", "color-sunken", 4.5],
  ["color-ink-muted", "color-bg", 4.5],
  ["color-ink-muted", "color-surface", 4.5],
  ["color-ink-muted", "color-sunken", 4.5],
  ["color-on-primary", "color-primary", 4.5],
  ["color-on-primary", "color-primary-hover", 4.5],
  ["color-on-primary", "color-primary-active", 4.5],
  ["color-on-accent", "color-accent", 4.5],
  ["color-accent-ink", "color-bg", 4.5],
  ["color-accent-ink", "color-surface", 4.5],
  ["color-danger", "color-bg", 4.5],
  ["color-danger", "color-surface", 4.5],
  ["color-success", "color-surface", 4.5],
  ["color-slip", "color-surface", 3],
  ["color-line", "color-bg", 3],
  ["color-line", "color-surface", 3],
  ["color-primary", "color-bg", 3],
  ["color-primary", "color-surface", 3],
  ["color-accent-strong", "color-bg", 3],
  ["color-accent-strong", "color-surface", 3],
  ["color-focus", "color-bg", 3],
  ["color-focus", "color-surface", 3],
  ["color-ink", "color-line-subtle", 4.5],
];

describe("design tokens", () => {
  it("defines the same colour tokens in light and dark", () => {
    expect(Object.keys(darkPinned).sort()).toEqual(Object.keys(light).sort());
  });

  it("keeps the pinned-dark and system-dark blocks identical", () => {
    expect(darkSystem).toEqual(darkPinned);
  });

  for (const [themeName, theme] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    describe(`${themeName} theme`, () => {
      it.each(pairs)("%s on %s meets %s:1", (fg, bg, min) => {
        const a = theme[fg];
        const b = theme[bg];
        expect(a, fg).toBeDefined();
        expect(b, bg).toBeDefined();
        expect(contrastRatio(a as string, b as string)).toBeGreaterThanOrEqual(min);
      });
    });
  }
});
