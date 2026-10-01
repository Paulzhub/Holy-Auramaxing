export const THEME_COOKIE = "theme";
export const THEME_STORAGE_KEY = "theme";
export const THEME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const themePreferences = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof themePreferences)[number];

// Deliberately zod-free: this module ships to the browser, and zod would add
// ~60 KB to every page. The Server Action validates with zod (see actions.ts).
export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (themePreferences as readonly string[]).includes(value);
}

export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

/** The value for <html data-theme>; undefined means "follow the system". */
export function themeAttribute(pref: ThemePreference): "light" | "dark" | undefined {
  return pref === "system" ? undefined : pref;
}

/** The value for <meta name="color-scheme">. */
export function colorSchemeContent(pref: ThemePreference): string {
  return pref === "system" ? "light dark" : pref;
}

/**
 * Runs in <head> before first paint. The server already renders the right
 * data-theme from the cookie; this script only covers the case where the
 * cookie is missing but the local cache still has a choice (for example after
 * cookies were cleared), so the page never flashes the wrong theme.
 * Kept tiny and dependency-free; it is covered by tests/e2e/theme.spec.ts.
 */
export const themeBootScript = `(function(){try{var d=document.documentElement,c=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)(?:;|$)/),t=c?c[1]:null;if(!t){var s=localStorage.getItem("${THEME_STORAGE_KEY}");if(s==="light"||s==="dark"||s==="system"){t=s;document.cookie="${THEME_COOKIE}="+s+"; path=/; max-age=${THEME_MAX_AGE_SECONDS}; samesite=lax"+(location.protocol==="https:"?"; secure":"")}}if(!t)return;if(t==="system"){d.removeAttribute("data-theme")}else{d.setAttribute("data-theme",t)}var m=document.querySelector('meta[name="color-scheme"]');if(m){m.setAttribute("content",t==="system"?"light dark":t)}}catch(e){}})();`;
