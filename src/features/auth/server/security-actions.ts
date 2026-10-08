"use server";

import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { consume } from "@/lib/security/rate-limit";
import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { formatRecoveryCode, generateRecoveryCodes, hashRecoveryCode } from "../recovery-codes";
import { fieldErrors } from "../schemas";
import { idSchema, totpCodeSchema } from "../security-schemas";
import type { RecoveryCodesState, TwoStepSetupState } from "../security-state";
import { requireAccount } from "./account";
import { markTwoStepPassed } from "./security-events";

/**
 * Settings → Security (D-028, D-030). Every action re-checks the account:
 * requireAccount() only passes a live session that has entered its
 * two-step code, and the database checks the same again.
 */

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

function asImageSrc(qr: string): string {
  if (qr.startsWith("data:")) return qr;
  return `data:image/svg+xml;base64,${Buffer.from(qr, "utf8").toString("base64")}`;
}

/** New recovery codes for the signed-in person (needs aal2; the database checks). */
async function createRecoveryCodes(userId: string): Promise<string[] | null> {
  const codes = generateRecoveryCodes();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("replace_recovery_codes", {
    p_hashes: codes.map((c) => hashRecoveryCode(userId, c)),
  });
  if (error) {
    devLog("mfa", error.message);
    return null;
  }
  await audit("auth.recovery_codes_created", userId);
  return codes.map(formatRecoveryCode);
}

/**
 * Setting up the authenticator app, in one form with an "intent":
 *  - start:   create an unverified factor and show its QR code and key
 *  - confirm: check a code from the app, which turns two-step sign-in on and
 *             upgrades this session; then show ten recovery codes once
 */
export async function twoStepSetupAction(prev: TwoStepSetupState, formData: FormData): Promise<TwoStepSetupState> {
  const { userId } = await requireAccount();
  const supabase = await createSupabaseServerClient();
  const intent = formData.get("intent");

  if (intent === "start") {
    if (!(await consume("mfaManageByUser", userId)).ok) return { status: "error", error: "rateLimited" };
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      devLog("mfa", listError.message);
      return { status: "error", error: "somethingWentWrong" };
    }
    if (factors.totp.length > 0) return { status: "error", error: "twoStepAlreadyOn" };
    // A setup that was started and abandoned: start again cleanly.
    for (const factor of factors.all) {
      if (factor.factor_type === "totp" && factor.status === "unverified") {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
      issuer: "Aura",
    });
    if (error || !data) {
      devLog("mfa", error?.message ?? "enroll returned nothing");
      return { status: "error", error: "somethingWentWrong" };
    }
    return { status: "scanning", factorId: data.id, qrCode: asImageSrc(data.totp.qr_code), secret: data.totp.secret };
  }

  if (intent === "confirm") {
    const keep = { factorId: prev.factorId, qrCode: prev.qrCode, secret: prev.secret };
    const factorId = idSchema.safeParse(formData.get("factorId"));
    if (!factorId.success) return { status: "error", error: "twoStepSetupExpired" };
    const code = totpCodeSchema.safeParse(formData.get("code") ?? undefined);
    if (!code.success) return { status: "scanning", ...keep, error: fieldErrors(code.error).code ?? "codeInvalid" };
    if (!(await consume("mfaVerifyByUser", userId)).ok) return { status: "scanning", ...keep, error: "rateLimited" };

    const { data: verified, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factorId.data,
      code: code.data,
    });
    if (error) {
      // An expired or unknown factor can't be confirmed; anything else is a wrong code.
      if (error.code === "mfa_factor_not_found") return { status: "error", error: "twoStepSetupExpired" };
      return { status: "scanning", ...keep, error: "codeInvalid" };
    }
    // This session just passed the code step here, so it stays signed in (D-050).
    if (!(await markTwoStepPassed(userId, verified?.access_token))) {
      return { status: "error", error: "somethingWentWrong" };
    }
    await audit("auth.mfa_enrolled", userId, { method: "totp" });
    const recoveryCodes = await createRecoveryCodes(userId);
    // No revalidatePath here: re-rendering the page would replace this form
    // (two-step is now "on") before the codes are shown. "I've saved them"
    // loads the page fresh.
    // If the codes failed, the page offers "Create recovery codes" instead.
    return recoveryCodes ? { status: "codes", recoveryCodes } : { status: "error", error: "somethingWentWrong" };
  }

  return { status: "idle" };
}

/** Replaces the recovery codes with ten new ones (the old ones stop working). */
export async function recoveryCodesAction(): Promise<RecoveryCodesState> {
  const { userId } = await requireAccount();
  if (!(await consume("mfaManageByUser", userId)).ok) return { status: "error", error: "rateLimited" };
  const recoveryCodes = await createRecoveryCodes(userId);
  return recoveryCodes ? { status: "codes", recoveryCodes } : { status: "error", error: "somethingWentWrong" };
}

/** Turns two-step sign-in off: removes the authenticator app and the recovery codes. */
export async function disableTwoStepAction(): Promise<void> {
  const { userId } = await requireAccount();
  if (!(await consume("mfaManageByUser", userId)).ok) await go("/settings/security?notice=rate-limited");
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type !== "totp") continue;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      devLog("mfa", error.message);
      await go("/settings/security?notice=failed");
    }
  }
  await createSupabaseAdminClient().rpc("clear_recovery_codes", { p_user_id: userId });
  await audit("auth.mfa_disabled", userId);
  await go("/settings/security?notice=two-step-off");
}

// ---------------------------------------------------------------- sessions

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount();
  const sessionId = idSchema.safeParse(formData.get("sessionId"));
  if (!sessionId.success) await go("/settings/security");
  if (!(await consume("sessionManageByUser", userId)).ok) await go("/settings/security?notice=rate-limited");

  const supabase = await createSupabaseServerClient();
  const { data: revoked } = await supabase.rpc("revoke_my_session", { p_session_id: sessionId.data! });
  if (revoked) await audit("auth.session_revoked", userId);
  await go(`/settings/security?notice=${revoked ? "session-signed-out" : "failed"}`);
}

export async function signOutOtherSessionsAction(): Promise<void> {
  const { userId } = await requireAccount();
  if (!(await consume("sessionManageByUser", userId)).ok) await go("/settings/security?notice=rate-limited");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    devLog("sessions", error.message);
    await go("/settings/security?notice=failed");
  }
  await audit("auth.signed_out_others", userId);
  await go("/settings/security?notice=signed-out-others");
}

export async function signOutEverywhereAction(): Promise<void> {
  const { userId } = await requireAccount();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "global" });
  await audit("auth.signed_out_everywhere", userId);
  await go("/sign-in?notice=signed-out-everywhere");
}
