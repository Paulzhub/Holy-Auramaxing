import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { THEME_COOKIE, THEME_MAX_AGE_SECONDS } from "@/lib/theme/theme";

/** Copies the profile's theme into the theme cookie after signing in (D-006). */
export async function syncThemeCookie(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("theme_pref").eq("id", userId).maybeSingle();
  if (!data?.theme_pref) return;
  (await cookies()).set(THEME_COOKIE, data.theme_pref, {
    path: "/",
    maxAge: THEME_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
}
