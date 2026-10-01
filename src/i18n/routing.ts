import { defineRouting } from "next-intl/routing";

export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  // English URLs stay unprefixed (/home); future locales get a prefix (/hi/home).
  localePrefix: "as-needed",
  // One locale today, so there is nothing to detect and no cookie to set.
  // Revisit when Hindi ships (locale will come from the user's profile).
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
});
