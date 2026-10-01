"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useSyncExternalStore, type FormEvent } from "react";

import { setThemeAction } from "@/lib/theme/actions";
import { applyTheme, readSavedTheme, themeStore } from "@/lib/theme/client";
import { parseThemePreference, themePreferences, type ThemePreference } from "@/lib/theme/theme";

const icons = { light: Sun, dark: Moon, system: Monitor } as const;

/**
 * Light / dark / system. Works without JavaScript (the form posts to a
 * Server Action); with JavaScript the change is instant and never reloads.
 */
export function ThemeSwitcher({ initial, showLabels = false }: { initial: ThemePreference; showLabels?: boolean }) {
  const t = useTranslations("theme");
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    () => themeStore.get() ?? initial,
    () => initial,
  );

  // Sync with what the boot script applied (the server may not have seen the
  // cookie yet), and re-apply after React's dev-only Strict Mode remount,
  // which resets <html> attributes.
  useLayoutEffect(() => {
    themeStore.hydrate(readSavedTheme() ?? initial);
    applyTheme(themeStore.get() ?? initial);
  }, [initial]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    themeStore.set(parseThemePreference(submitter?.getAttribute("value")));
  }

  return (
    <form action={setThemeAction} onSubmit={handleSubmit}>
      <fieldset className="ui-segmented" data-labels={showLabels || undefined}>
        <legend className="visually-hidden">{t("label")}</legend>
        {themePreferences.map((pref) => {
          const Icon = icons[pref];
          return (
            <button key={pref} type="submit" name="theme" value={pref} aria-pressed={theme === pref}>
              <Icon aria-hidden="true" />
              <span className={showLabels ? undefined : "visually-hidden"}>{t(pref)}</span>
            </button>
          );
        })}
      </fieldset>
    </form>
  );
}
