"use server";

import type { AuthError } from "@supabase/supabase-js";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect as redirectExternal } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { siteOrigin } from "@/lib/env";
import { checkPwnedPassword } from "@/lib/security/pwned-passwords";
import { clear, consume, refund } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request-info";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { AuthErrorKey, AuthFormState } from "../form-state";
import {
  ageSchema,
  consentSchema,
  emailOnlySchema,
  emailSignUpSchema,
  fieldErrors,
  newPasswordFormSchema,
  passwordSignInSchema,
  safeNextPath,
} from "../schemas";
import { audit } from "@/lib/server/audit";
import { verifyEmailLink } from "./oauth";
import { afterFirstStep, readAuthGate, recordSignIn } from "./security-events";
import { syncThemeCookie } from "./theme-sync";
import {
  clearSignupCookies,
  hasAdultAnswer,
  issueSignupTicket,
  readSignupTicket,
  rememberAdultAnswer,
} from "./tickets";

// ---------------------------------------------------------------- helpers

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  // redirect() throws; this line is never reached.
  throw new Error("unreachable");
}

async function origin(): Promise<string> {
  const h = await headers();
  return siteOrigin(h.get("origin") ?? undefined);
}

function tooMany(retryAfterSeconds: number, email?: string): AuthFormState {
  return {
    status: "error",
    formError: "tooManyAttempts",
    formErrorValues: { minutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)) },
    email,
  };
}

/** Maps Supabase Auth errors to message keys. Never echoes provider text to users. */
function authErrorKey(error: AuthError): AuthErrorKey {
  switch (error.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "captcha_failed":
      return "captchaFailed";
    case "weak_password":
      return "passwordBreached";
    case "same_password":
      return "samePassword";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "tooManyEmails";
    case "unexpected_failure":
      // The database refused the new user: the sign-up ticket was missing,
      // used or expired (see supabase/migrations/*_auth_signup_and_consents.sql).
      return "signupExpired";
    default:
      return error.status === 429 ? "tooManyEmails" : "somethingWentWrong";
  }
}

// ---------------------------------------------------------------- sign-up

/** Step 1: "Are you 18 or older?" A "no" never creates anything. */
export async function ageAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = ageSchema.safeParse({ adult: formData.get("adult") ?? undefined });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  if (parsed.data.adult === "no") {
    // Nothing about this visitor is stored, not even a cookie (DPDP: no tracking of children).
    await clearSignupCookies();
    return go("/sign-up/under-18");
  }
  const limit = await consume("signUpTicketByIp", await clientIp());
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  await rememberAdultAnswer();
  return go("/sign-up/consent");
}

/** Step 2: consent. Issues the sign-up ticket that account creation requires. */
export async function consentAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!(await hasAdultAnswer())) return go("/sign-up");

  const parsed = consentSchema.safeParse({
    termsPrivacy: formData.get("termsPrivacy") ?? undefined,
    sensitiveData: formData.get("sensitiveData") ?? undefined,
    timezone: formData.get("timezone") ?? undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const limit = await consume("signUpTicketByIp", await clientIp());
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  try {
    await issueSignupTicket(parsed.data.timezone);
  } catch {
    return { status: "error", formError: "somethingWentWrong" };
  }
  return go("/sign-up/account");
}

/** Step 3a: email and password. */
export async function emailSignUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ticket = await readSignupTicket();
  if (!ticket) return go("/sign-up?notice=expired");

  const parsed = emailSignUpSchema.safeParse({
    email: formData.get("email") ?? undefined,
    password: formData.get("password") ?? undefined,
    captchaToken: formData.get("captchaToken") || undefined,
  });
  const typedEmail = String(formData.get("email") ?? "").slice(0, 254);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), email: typedEmail };
  const { email, password, captchaToken } = parsed.data;

  const limit = await consume("signUpByIp", await clientIp());
  if (!limit.ok) return tooMany(limit.retryAfterSeconds, email);

  if ((await checkPwnedPassword(password)) === "breached") {
    return { status: "error", fieldErrors: { password: "passwordBreached" }, email };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await origin()}/api/auth/confirm`,
      data: { signup_ticket: ticket },
      captchaToken,
    },
  });
  if (error) {
    const key = authErrorKey(error);
    if (key === "signupExpired") {
      await clearSignupCookies();
      return go("/sign-up?notice=expired");
    }
    return { status: "error", formError: key, email };
  }
  // If the address is already registered, Supabase answers exactly as it
  // does for a new one, so nobody can use this form to find out who has an
  // account. Either way: check your inbox.
  return go("/sign-up/check-email");
}

/** Step 3b (and "Continue with Google" on the sign-in page). */
export async function googleAction(formData: FormData): Promise<void> {
  const intent = formData.get("intent") === "signup" ? "signup" : "signin";
  if (intent === "signup" && !(await readSignupTicket())) await go("/sign-up?notice=expired");

  const next = safeNextPath(String(formData.get("next") ?? ""), "/home");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await origin()}/api/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) await go(intent === "signup" ? "/sign-up/account?notice=google" : "/sign-in?notice=google");
  // An external URL (Google's account chooser), so no locale prefix.
  redirectExternal(data.url!);
}

// ---------------------------------------------------------------- sign-in

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = passwordSignInSchema.safeParse({
    email: formData.get("email") ?? undefined,
    password: formData.get("password") ?? undefined,
    captchaToken: formData.get("captchaToken") || undefined,
    next: formData.get("next") || undefined,
  });
  const typedEmail = String(formData.get("email") ?? "").slice(0, 254);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), email: typedEmail };
  const { email, password, captchaToken, next } = parsed.data;

  const ipLimit = await consume("signInByIp", await clientIp());
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfterSeconds, email);
  // Progressive lock-out: after 5 wrong passwords for an address, wait out the
  // window. The try is counted before the password is checked, so passwords
  // sent all at once can't all slip past it (D-053); anything other than a
  // wrong password gives it back.
  const lockout = await consume("signInFailuresByEmail", email);
  if (!lockout.ok) return tooMany(lockout.retryAfterSeconds, email);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error || !data.user) {
    const key = error ? authErrorKey(error) : "somethingWentWrong";
    if (key === "invalidCredentials") {
      await audit("auth.sign_in_failed", null, { method: "password", reason: "invalid_credentials" });
    } else {
      await refund("signInFailuresByEmail", email);
    }
    return { status: "error", formError: key, email };
  }

  await clear("signInFailuresByEmail", email);
  await audit("auth.sign_in", data.user.id, { method: "password" });
  await recordSignIn({ userId: data.user.id, email: data.user.email, accessToken: data.session?.access_token });
  const gate = await readAuthGate(supabase);
  if (!gate.mfaPending) await syncThemeCookie(data.user.id);
  return go(afterFirstStep(safeNextPath(next), gate));
}

/** Magic link. Only for existing accounts: it never creates one. */
export async function magicLinkAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return sendEmailLink(formData, "magicLink");
}

export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return sendEmailLink(formData, "passwordReset");
}

export async function resendVerificationAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return sendEmailLink(formData, "verification");
}

async function sendEmailLink(
  formData: FormData,
  kind: "magicLink" | "passwordReset" | "verification",
): Promise<AuthFormState> {
  const parsed = emailOnlySchema.safeParse({
    email: formData.get("email") ?? undefined,
    captchaToken: formData.get("captchaToken") || undefined,
    next: formData.get("next") || undefined,
  });
  const typedEmail = String(formData.get("email") ?? "").slice(0, 254);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), email: typedEmail };
  const { email, captchaToken, next } = parsed.data;

  const byIp = await consume("emailByIp", await clientIp());
  if (!byIp.ok) return tooMany(byIp.retryAfterSeconds, email);
  const byAddress = await consume("emailByAddress", email);
  // Same neutral answer when one address is being flooded: don't reveal it.
  const sent: AuthFormState = { status: "sent", notice: `${kind}Sent` as const, email };
  if (!byAddress.ok) return sent;

  const supabase = await createSupabaseServerClient();
  const base = `${await origin()}/api/auth/confirm`;
  let error: AuthError | null = null;
  if (kind === "magicLink") {
    ({ error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${base}?next=${encodeURIComponent(safeNextPath(next))}`,
        captchaToken,
      },
    }));
  } else if (kind === "passwordReset") {
    ({ error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: base, captchaToken }));
  } else {
    ({ error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: base, captchaToken },
    }));
  }

  // Unknown addresses look exactly like known ones. Only problems the person
  // can act on (a failed security check, too many emails) are reported.
  if (error) {
    const key = authErrorKey(error);
    if (key === "captchaFailed" || key === "tooManyEmails") return { status: "error", formError: key, email };
  }
  return sent;
}

/** Sets a new password for the signed-in user (after a reset link). */
export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return go("/forgot-password?notice=expired");

  const parsed = newPasswordFormSchema.safeParse({ password: formData.get("password") ?? undefined });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const limit = await consume("passwordChangeByUser", userId);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  if ((await checkPwnedPassword(parsed.data.password)) === "breached") {
    return { status: "error", fieldErrors: { password: "passwordBreached" } };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const key = authErrorKey(error);
    return key === "samePassword" || key === "passwordBreached"
      ? { status: "error", fieldErrors: { password: key } }
      : { status: "error", formError: key };
  }
  // Every other session is signed out; this device stays signed in.
  await supabase.auth.signOut({ scope: "others" });
  await audit("auth.password_changed", userId, { via: "reset_link" });
  return go("/home?notice=password-updated");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  await supabase.auth.signOut({ scope: "local" });
  if (data?.claims.sub) await audit("auth.sign_out", data.claims.sub);
  await go("/?notice=signed-out");
}

const linkTypes = ["signup", "email", "magiclink", "recovery", "email_change"] as const;

/** The "Continue" button on /confirm: verifies an email link's one-time token. */
export async function confirmLinkAction(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(tokenHash) || !(linkTypes as readonly string[]).includes(type)) {
    await go("/sign-in?notice=link-invalid");
  }
  const destination = await verifyEmailLink({
    tokenHash,
    type: type as (typeof linkTypes)[number],
    next: formData.get("next") ? String(formData.get("next")) : null,
  });
  await go(destination);
}
