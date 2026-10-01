import { beforeEach, describe, expect, it } from "vitest";

import {
  colorSchemeContent,
  parseThemePreference,
  themeAttribute,
  themeBootScript,
  type ThemePreference,
} from "./theme";

function clearCookies() {
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
}

function runBootScript() {
  // Executes our own inline script under test.
  new Function(themeBootScript)();
}

describe("theme preference helpers", () => {
  it("falls back to system for anything unexpected", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("DARK")).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference("<script>")).toBe("system");
  });

  it.each<[ThemePreference, string | undefined, string]>([
    ["light", "light", "light"],
    ["dark", "dark", "dark"],
    ["system", undefined, "light dark"],
  ])("%s → data-theme=%s, color-scheme=%s", (pref, attr, scheme) => {
    expect(themeAttribute(pref)).toBe(attr);
    expect(colorSchemeContent(pref)).toBe(scheme);
  });
});

describe("theme boot script", () => {
  beforeEach(() => {
    clearCookies();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.head.innerHTML = '<meta name="color-scheme" content="light dark">';
  });

  it("does nothing when no choice was saved (system default)", () => {
    runBootScript();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("applies the cookie", () => {
    document.cookie = "theme=dark; path=/";
    runBootScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe("dark");
  });

  it("restores the cached choice and re-creates the cookie when the cookie is gone", () => {
    localStorage.setItem("theme", "light");
    runBootScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.cookie).toContain("theme=light");
  });

  it("ignores tampered values", () => {
    document.cookie = "theme=evil; path=/";
    localStorage.setItem("theme", "javascript:alert(1)");
    runBootScript();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("removes a stale attribute when the choice is system", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.cookie = "theme=system; path=/";
    runBootScript();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
