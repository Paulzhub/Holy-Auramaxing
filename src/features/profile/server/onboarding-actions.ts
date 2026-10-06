"use server";

import { getLocale } from "next-intl/server";

import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { encryptText } from "@/lib/security/encryption";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  displayNameSchema,
  myWhySchema,
  nextStep,
  type OnboardingErrorKey,
  type OnboardingFormState,
  type OnboardingStep,
  reminderSchema,
} from "../onboarding";

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

async function advance(from: OnboardingStep): Promise<never> {
  const next = nextStep(from);
  return go(next ? `/welcome?step=${next}` : "/home");
}

function fail(error: OnboardingErrorKey, detail?: string): OnboardingFormState {
  if (detail) devLog("onboarding", detail);
  return { error };
}

export async function saveWelcomeAction(_prev: OnboardingFormState, formData: FormData): Promise<OnboardingFormState> {
  const { userId } = await requireAccount();
  const parsed = displayNameSchema.safeParse(String(formData.get("displayName") ?? ""));
  if (!parsed.success) return fail(parsed.error.issues[0]!.message as OnboardingErrorKey);
  if (parsed.data) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", userId);
    if (error) return fail("saveFailed", error.message);
  }
  return advance("welcome");
}

export async function saveWhyAction(_prev: OnboardingFormState, formData: FormData): Promise<OnboardingFormState> {
  const { userId } = await requireAccount();
  const parsed = myWhySchema.safeParse(String(formData.get("myWhy") ?? ""));
  if (!parsed.success) return fail("whyTooLong");
  const supabase = await createSupabaseServerClient();
  // Encrypted here, before it leaves the server; bound to this user's id.
  const value = parsed.data ? encryptText(parsed.data, userId) : null;
  // Update if a row exists, otherwise insert. (An upsert would also try to
  // rewrite user_id, which members are deliberately not allowed to change.)
  const { data: updated, error: updateError } = await supabase
    .from("profile_private")
    .update({ my_why_encrypted: value })
    .eq("user_id", userId)
    .select("user_id");
  if (updateError) return fail("saveFailed", updateError.message);
  if (!updated?.length && value) {
    const { error } = await supabase.from("profile_private").insert({ user_id: userId, my_why_encrypted: value });
    if (error) return fail("saveFailed", error.message);
  }
  return advance("why");
}

export async function saveReminderAction(_prev: OnboardingFormState, formData: FormData): Promise<OnboardingFormState> {
  const { userId } = await requireAccount();
  const parsed = reminderSchema.safeParse({
    reminderTime: String(formData.get("reminderTime") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
  });
  if (!parsed.success) return fail("timeInvalid");
  // The database checks the zone against Postgres's own list (profiles trigger).
  const supabase = await createSupabaseServerClient();
  const [a, b] = await Promise.all([
    supabase
      .from("notification_settings")
      .update({ reminder_time: parsed.data.reminderTime || null })
      .eq("user_id", userId),
    supabase.from("profiles").update({ timezone: parsed.data.timezone }).eq("id", userId),
  ]);
  if (a.error || b.error) return fail(b.error ? "timezoneInvalid" : "saveFailed", (a.error ?? b.error)?.message);
  return advance("reminder");
}

export async function saveDiscreetAction(_prev: OnboardingFormState, formData: FormData): Promise<OnboardingFormState> {
  const { userId } = await requireAccount();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("notification_settings")
    .update({ discreet_mode: formData.get("discreetMode") === "on" })
    .eq("user_id", userId);
  if (error) return fail("saveFailed", error.message);
  return advance("discreet");
}

/** "Go to Today" on the last step, or "Skip setup" on any step. */
export async function finishOnboardingAction(): Promise<void> {
  await requireAccount();
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("complete_onboarding");
  await go("/home");
}
