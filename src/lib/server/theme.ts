import { cookies } from "next/headers";

import { THEME_COOKIE, parseThemePreference, type ThemePreference } from "@/lib/theme/theme";

/** The visitor's saved theme, read from the cookie set by the switcher. */
export async function getThemePreference(): Promise<ThemePreference> {
  return parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);
}
