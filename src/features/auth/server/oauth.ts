import { cookies } from "next/headers";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { THEME_COOKIE, THEME_MAX_AGE_SECONDS } from "@/lib/theme/theme";

import { safeNextPath } from "../schemas";
import { audit } from "./audit";
import { clearSignupCookies, readSignupTicket } from "./tickets";

/**
 * Finishes a Google sign-in after the redirect back. Returns where to send
 * the browser next (always a same-site path).
 *
 *  - Existing account: signed in.
 *  - New Google user who came through the age and consent steps: the
 *    account is created from their sign-up ticket.
 *  - New Google user without a ticket (pressed "Continue with Google" on the
 *    sign-in page without an account): the auth user Supabase just created
 *    is deleted at once and they are sent to the age question. See D-014.
 */
export async function finishOAuthSignIn(input: {
  code: string | null;
  providerError: string | null;
  next: string | null;
}): Promise<string> {
  if (input.providerError) return "/sign-in?notice=google-cancelled";
  if (!input.code) return "/sign-in?notice=link-invalid";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(input.code);
  const user = data?.user;
  if (error || !user) return "/sign-in?notice=link-invalid";

  const { data: profile } = await supabase.from("profiles").select("id, theme_pref").eq("id", user.id).maybeSingle();

  if (!profile) {
    const ticket = await readSignupTicket();
    const admin = createSupabaseAdminClient();
    let completed = false;
    if (ticket) {
      const { data: ok } = await admin.rpc("complete_oauth_signup", { p_user_id: user.id, p_token: ticket });
      completed = ok === true;
    }
    if (!completed) {
      await supabase.auth.signOut({ scope: "local" });
      await admin.auth.admin.deleteUser(user.id);
      await audit("auth.oauth_signup_rejected", null, { method: "google" });
      return "/sign-up?notice=start-here";
    }
    await clearSignupCookies();
    await audit("auth.sign_in", user.id, { method: "google", first: true });
    return "/welcome";
  }

  await audit("auth.sign_in", user.id, { method: "google" });
  if (profile.theme_pref) {
    (await cookies()).set(THEME_COOKIE, profile.theme_pref, {
      path: "/",
      maxAge: THEME_MAX_AGE_SECONDS,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    });
  }
  return safeNextPath(input.next);
}

/** Signs out only a session whose sign-up was never finished (no profile). */
export async function signOutIncompleteAccount(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return "/sign-up";
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (profile) return "/home";
  await supabase.auth.signOut({ scope: "local" });
  return "/sign-up?notice=start-here";
}

/**
 * Verifies the one-time token from an email link (sign-up confirmation,
 * magic link, password reset, email change) and returns where to go.
 */
export async function verifyEmailLink(input: {
  tokenHash: string;
  type: "signup" | "email" | "magiclink" | "recovery" | "email_change";
  next: string | null;
}): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: input.tokenHash,
    type: input.type === "magiclink" ? "email" : input.type,
  });
  if (error || !data.user) {
    return input.type === "recovery" ? "/forgot-password?notice=link-invalid" : "/sign-in?notice=link-invalid";
  }
  const method =
    input.type === "recovery" ? "password_reset_link" : input.type === "signup" ? "email_confirmation" : "email_link";
  await audit("auth.sign_in", data.user.id, { method });

  switch (input.type) {
    case "recovery":
      return "/reset-password";
    case "email_change":
      return "/settings?notice=email-changed";
    case "signup":
      return "/welcome";
    default:
      return safeNextPath(input.next);
  }
}
