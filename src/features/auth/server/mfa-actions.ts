"use server";

import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { consume } from "@/lib/security/rate-limit";
import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { AuthFormState } from "../form-state";
import { hashRecoveryCode, normaliseRecoveryCode } from "../recovery-codes";
import { fieldErrors, safeNextPath } from "../schemas";
import { recoveryCodeInputSchema, totpCodeSchema } from "../security-schemas";
import { markTwoStepPassed, queueSecurityAlert, readAuthGate } from "./security-events";
import { syncThemeCookie } from "./theme-sync";

/**
 * The second step of signing in (/sign-in/verify, D-028): a code from the
 * authenticator app, or one of the recovery codes. Codes and recovery codes
 * share one limit: 5 wrong tries per 15 minutes per person.
 */

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

function tooMany(retryAfterSeconds: number): AuthFormState {
  return {
    status: "error",
    formError: "tooManyAttempts",
    formErrorValues: { minutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)) },
  };
}

/** The signed-in person who still needs their code, or a redirect. */
async function pendingSession() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return go("/sign-in");
  const gate = await readAuthGate(supabase);
  if (!gate.sessionActive) return go("/api/auth/sign-out?reason=ended");
  return { supabase, userId, email: typeof data.claims.email === "string" ? data.claims.email : null, gate };
}

export async function verifyTotpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { supabase, userId, gate } = await pendingSession();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (!gate.mfaPending) return go(next);

  const parsed = totpCodeSchema.safeParse(formData.get("code") ?? undefined);
  if (!parsed.success)
    return { status: "error", fieldErrors: { code: fieldErrors(parsed.error).code ?? "codeInvalid" } };

  const limit = await consume("mfaVerifyByUser", userId);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (listError || !factor) {
    devLog("mfa", listError ?? "no verified TOTP factor");
    return { status: "error", formError: "somethingWentWrong" };
  }
  const { data: verified, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data,
  });
  if (error) {
    await audit("auth.mfa_failed", userId, { method: "totp" });
    if (error.status === 429) return tooMany(60);
    return { status: "error", fieldErrors: { code: "codeInvalid" } };
  }
  // The database only accepts aal2 sessions this step has vouched for (D-050).
  if (!(await markTwoStepPassed(userId, verified?.access_token))) {
    return { status: "error", formError: "somethingWentWrong" };
  }

  await audit("auth.mfa_verified", userId, { method: "totp" });
  await syncThemeCookie(userId);
  return go(next);
}

/**
 * A recovery code signs the person in and turns two-step sign-in off (their
 * authenticator is probably lost), signs out every other device, and sends
 * an email. They're then asked to set it up again.
 */
export async function redeemRecoveryCodeAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { supabase, userId, email, gate } = await pendingSession();
  if (!gate.mfaPending) return go(safeNextPath(String(formData.get("next") ?? "")));

  const parsed = recoveryCodeInputSchema.safeParse(formData.get("recoveryCode") ?? undefined);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: { recoveryCode: fieldErrors(parsed.error).recoveryCode ?? "recoveryCodeInvalid" },
    };
  }
  const limit = await consume("mfaVerifyByUser", userId);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const code = normaliseRecoveryCode(parsed.data);
  const admin = createSupabaseAdminClient();
  const { data: matched } = code
    ? await admin.rpc("use_recovery_code", { p_user_id: userId, p_hash: hashRecoveryCode(userId, code) })
    : { data: false };
  if (!matched) {
    await audit("auth.mfa_failed", userId, { method: "recovery_code" });
    return { status: "error", fieldErrors: { recoveryCode: "recoveryCodeInvalid" } };
  }

  try {
    const { data: factors, error } = await admin.auth.admin.mfa.listFactors({ userId });
    if (error) throw error;
    for (const factor of factors?.factors ?? []) {
      if (factor.factor_type === "totp") {
        const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
        if (deleteError) throw deleteError;
      }
    }
    await admin.rpc("clear_recovery_codes", { p_user_id: userId });
  } catch (error) {
    devLog("mfa", error);
    return { status: "error", formError: "somethingWentWrong" };
  }

  await supabase.auth.signOut({ scope: "others" });
  await audit("auth.recovery_code_used", userId);
  await queueSecurityAlert("recoveryCodeUsed", userId, email);
  await syncThemeCookie(userId);
  return go("/settings/security?notice=recovery-used");
}
