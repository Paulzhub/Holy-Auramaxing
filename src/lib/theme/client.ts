import {
  THEME_COOKIE,
  THEME_MAX_AGE_SECONDS,
  THEME_STORAGE_KEY,
  colorSchemeContent,
  themeAttribute,
  type ThemePreference,
} from "./theme";

type Listener = () => void;

let current: ThemePreference | null = null;
const listeners = new Set<Listener>();

export const themeStore = {
  get: (): ThemePreference | null => current,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Adopt the theme already applied by the boot script, without re-saving it. */
  hydrate(pref: ThemePreference): void {
    if (current !== null) return;
    current = pref;
    applyTheme(pref);
    listeners.forEach((listener) => listener());
  },
  set(pref: ThemePreference): void {
    current = pref;
    applyTheme(pref);
    persistTheme(pref);
    listeners.forEach((listener) => listener());
  },
};

/** The saved preference as the browser sees it now (cookie first, then cache). */
export function readSavedTheme(): ThemePreference | null {
  const match = new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark|system)(?:;|$)`).exec(document.cookie);
  if (match?.[1]) return match[1] as ThemePreference;
  try {
    const cached = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (cached === "light" || cached === "dark" || cached === "system") return cached;
  } catch {
    // Storage unavailable.
  }
  return null;
}

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  const attr = themeAttribute(pref);
  if (attr) root.setAttribute("data-theme", attr);
  else root.removeAttribute("data-theme");
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", colorSchemeContent(pref));
}

function persistTheme(pref: ThemePreference): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=${THEME_MAX_AGE_SECONDS}; samesite=lax${secure}`;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage can be unavailable (private mode); the cookie is enough.
  }
}
