import { cookies } from "next/headers";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { THEME_COOKIE, THEME_MAX_AGE_SECONDS } from "@/lib/theme/theme";

import { safeNextPath } from "../schemas";
import { audit } from "@/lib/server/audit";
import { afterFirstStep, readAuthGate, recordSignIn } from "./security-events";
import { clearSignupCookies, readSignupTicket } from "./tickets";

async function setThemeCookie(theme: string | null | undefined) {
  if (!theme) return;
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: THEME_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
}

/**
 * Finishes a Google sign-in after the redirect back. Returns where to send
 * the browser next (always a same-site path).
 *
 *  - Existing account: signed in (then the two-step code page if it's on).
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

  // Read with the secret key: with two-step sign-in on, row-level security
  // hides the profile until the code is entered, and a missing profile here
  // would otherwise look like an unfinished sign-up (D-028).
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, theme_pref").eq("id", user.id).maybeSingle();

  if (!profile) {
    const ticket = await readSignupTicket();
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
    await recordSignIn({ userId: user.id, email: user.email, accessToken: data.session?.access_token });
    return "/welcome";
  }

  await audit("auth.sign_in", user.id, { method: "google" });
  await recordSignIn({ userId: user.id, email: user.email, accessToken: data.session?.access_token });
  await setThemeCookie(profile.theme_pref);
  return afterFirstStep(safeNextPath(input.next), await readAuthGate(supabase));
}

/**
 * GET /api/auth/sign-out: clears this browser's session only when the
 * database already refuses it, so a link to it can't sign out a working
 * account. Normal sign-out is a POST Server Action (signOutAction).
 *
 *  - signed out from another device ("ended")
 *  - signed in, but sign-up was never finished (no profile, D-014)
 */
export async function signOutIncompleteAccount(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return "/sign-in";

  const gate = await readAuthGate(supabase);
  if (!gate.sessionActive) {
    await supabase.auth.signOut({ scope: "local" });
    return "/sign-in?notice=session-ended";
  }
  if (gate.mfaPending) return "/sign-in/verify";

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
  await recordSignIn({ userId: data.user.id, email: data.user.email, accessToken: data.session?.access_token });

  const destination =
    input.type === "recovery"
      ? "/reset-password"
      : input.type === "email_change"
        ? "/settings?notice=email-changed"
        : input.type === "signup"
          ? "/welcome"
          : safeNextPath(input.next);
  // An email link is one step, like a password: with two-step sign-in on,
  // the code comes next, even before choosing a new password.
  return input.type === "signup" ? destination : afterFirstStep(destination, await readAuthGate(supabase));
}
