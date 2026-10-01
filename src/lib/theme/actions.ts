"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { THEME_COOKIE, THEME_MAX_AGE_SECONDS, themePreferences } from "./theme";

const themePreferenceSchema = z.enum(themePreferences);

/**
 * No-JavaScript fallback for the theme switcher. With JavaScript the switcher
 * applies the theme instantly on the client and never calls this.
 * Server Actions are protected against CSRF by Next.js (Origin check).
 */
export async function setThemeAction(formData: FormData): Promise<void> {
  const parsed = themePreferenceSchema.safeParse(formData.get("theme"));
  if (!parsed.success) return;

  (await cookies()).set(THEME_COOKIE, parsed.data, {
    path: "/",
    maxAge: THEME_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Readable by the boot script and the switcher; it holds no secret.
    httpOnly: false,
  });
}
