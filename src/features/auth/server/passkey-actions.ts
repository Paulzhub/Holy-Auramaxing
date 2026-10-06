"use server";

import type { AuthError } from "@supabase/supabase-js";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { getPathname, redirect } from "@/i18n/navigation";
import { passkeysEnabled } from "@/lib/env";
import { consume } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request-info";
import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { AuthErrorKey } from "../form-state";
import { safeNextPath } from "../schemas";
import { idSchema, passkeyFinishSchema, passkeyNameSchema } from "../security-schemas";
import type { PasskeyFinishResult, PasskeyStartResult } from "../security-state";
import { requireAccount } from "./account";
import { afterFirstStep, queueSecurityAlert, readAuthGate, recordSignIn } from "./security-events";
import { syncThemeCookie } from "./theme-sync";

/**
 * Passkeys through Supabase Auth (beta), D-029. The ceremony is split: these
 * actions ask Supabase for the options and hand the browser's answer back;
 * the browser only runs navigator.credentials. Session tokens never reach
 * page scripts. A passkey signs in at aal1, so anyone with an authenticator
 * app still enters its code next.
 */

type ServerCredential = Parameters<
  Awaited<ReturnType<typeof createSupabaseServerClient>>["auth"]["passkey"]["verifyAuthentication"]
>[0]["credential"];

function passkeyError(error: AuthError | Error | null): AuthErrorKey {
  const code = error && "code" in error ? error.code : undefined;
  if (code === "insufficient_aal") return "passkeyNeedsCode";
  if (error && "status" in error && error.status === 429) return "tooManyAttempts";
  return "passkeyFailed";
}

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

// ---------------------------------------------------------------- sign-in

export async function startPasskeySignInAction(captchaToken?: string): Promise<PasskeyStartResult> {
  if (!passkeysEnabled()) return { ok: false, error: "passkeyUnsupported" };
  const limit = await consume("passkeySignInByIp", await clientIp());
  if (!limit.ok)
    return { ok: false, error: "tooManyAttempts", retryAfterMinutes: Math.ceil(limit.retryAfterSeconds / 60) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.passkey.startAuthentication({
    options: {
      captchaToken: typeof captchaToken === "string" && captchaToken.length < 4096 ? captchaToken : undefined,
    },
  });
  if (error || !data) {
    devLog("passkey", error?.message ?? "no options");
    return { ok: false, error: error?.code === "captcha_failed" ? "captchaFailed" : "passkeyFailed" };
  }
  return { ok: true, challengeId: data.challenge_id, options: data.options as unknown as Record<string, unknown> };
}

export async function finishPasskeySignInAction(input: unknown): Promise<PasskeyFinishResult> {
  if (!passkeysEnabled()) return { ok: false, error: "passkeyUnsupported" };
  const parsed = passkeyFinishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "passkeyFailed" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.passkey.verifyAuthentication({
    challengeId: parsed.data.challengeId,
    credential: parsed.data.credential as unknown as ServerCredential,
  });
  const user = data?.user;
  if (error || !user || !data.session) {
    devLog("passkey", error?.message ?? "no session");
    await audit("auth.sign_in_failed", null, { method: "passkey" });
    return { ok: false, error: passkeyError(error) };
  }

  await audit("auth.sign_in", user.id, { method: "passkey" });
  await recordSignIn({ userId: user.id, email: user.email, accessToken: data.session.access_token });
  const gate = await readAuthGate(supabase);
  if (!gate.mfaPending) await syncThemeCookie(user.id);
  const href = afterFirstStep(safeNextPath(parsed.data.next), gate);
  return { ok: true, redirectTo: getPathname({ href, locale: await getLocale() }) };
}

// ---------------------------------------------------------------- managing passkeys

export async function startPasskeyRegistrationAction(): Promise<PasskeyStartResult> {
  if (!passkeysEnabled()) return { ok: false, error: "passkeyUnsupported" };
  const { userId } = await requireAccount();
  if (!(await consume("passkeyManageByUser", userId)).ok) return { ok: false, error: "rateLimited" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.passkey.startRegistration();
  if (error || !data) {
    devLog("passkey", error?.message ?? "no options");
    return { ok: false, error: passkeyError(error) };
  }
  return { ok: true, challengeId: data.challenge_id, options: data.options as unknown as Record<string, unknown> };
}

export async function finishPasskeyRegistrationAction(input: unknown): Promise<PasskeyFinishResult> {
  if (!passkeysEnabled()) return { ok: false, error: "passkeyUnsupported" };
  const { userId, email } = await requireAccount();
  const parsed = passkeyFinishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "passkeyFailed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.passkey.verifyRegistration({
    challengeId: parsed.data.challengeId,
    credential: parsed.data.credential as unknown as ServerCredential,
  });
  if (error) {
    devLog("passkey", error.message);
    return { ok: false, error: passkeyError(error) };
  }
  await audit("auth.passkey_added", userId);
  await queueSecurityAlert("passkeyAdded", userId, email);
  revalidatePath("/[locale]/settings/security", "page");
  const href = "/settings/security?notice=passkey-added";
  return { ok: true, redirectTo: getPathname({ href, locale: await getLocale() }) };
}

export async function renamePasskeyAction(formData: FormData): Promise<void> {
  if (!passkeysEnabled()) await go("/settings/security");
  const { userId } = await requireAccount();
  const id = idSchema.safeParse(formData.get("passkeyId"));
  const name = passkeyNameSchema.safeParse(formData.get("name") ?? undefined);
  if (!id.success) await go("/settings/security");
  if (!name.success) await go("/settings/security?notice=passkey-name-invalid");
  if (!(await consume("passkeyManageByUser", userId)).ok) await go("/settings/security?notice=rate-limited");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.passkey.update({ passkeyId: id.data!, friendlyName: name.data! });
  if (error) {
    devLog("passkey", error.message);
    await go("/settings/security?notice=failed");
  }
  await audit("auth.passkey_renamed", userId);
  await go("/settings/security?notice=passkey-renamed");
}

export async function removePasskeyAction(formData: FormData): Promise<void> {
  if (!passkeysEnabled()) await go("/settings/security");
  const { userId } = await requireAccount();
  const id = idSchema.safeParse(formData.get("passkeyId"));
  if (!id.success) await go("/settings/security");
  if (!(await consume("passkeyManageByUser", userId)).ok) await go("/settings/security?notice=rate-limited");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.passkey.delete({ passkeyId: id.data! });
  if (error) {
    devLog("passkey", error.message);
    await go("/settings/security?notice=failed");
  }
  await audit("auth.passkey_removed", userId);
  await go("/settings/security?notice=passkey-removed");
}
