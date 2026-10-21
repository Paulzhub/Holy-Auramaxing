"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { consume, type RateLimitRule } from "@/lib/security/rate-limit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPE_LIST, SNOOZE_CHOICES, isLockedType } from "../constants";
import { deliverySettingsSchema, uuidSchema } from "../schemas";
import { applyUnsubscribe } from "./deliver";
import { verifyUnsubscribe } from "./unsubscribe";

/**
 * Notification centre and settings writes (CLAUDE.md §7.8, D-089, D-090).
 * Plain forms that work without JavaScript: each validates, rate-limits,
 * calls the database function as the person (which checks again and
 * throttles), and redirects back with a known ?notice= or ?error=.
 */

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

/** The bell and switcher counts are in the app layout; settings pages show what was saved. */
function refresh() {
  revalidatePath("/[locale]", "layout");
}

async function signedIn(rule: RateLimitRule): Promise<{ userId: string; supabase: Client } | null> {
  const { userId } = await requireAccount();
  if (!(await consume(rule, userId)).ok) return null;
  return { userId, supabase: await createSupabaseServerClient() };
}

const SETTINGS = "/settings/notifications";

// ---------------------------------------------------------------- the centre

export async function markReadAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!uuidSchema.safeParse(id).success) return go("/alerts?error=failed");
  const ctx = await signedIn("notificationReadByUser");
  if (!ctx) return go("/alerts?error=rateLimited");
  const { error } = await ctx.supabase.rpc("mark_notifications_read", { p_ids: [id] });
  if (error) devLog("notifications", error);
  refresh();
  return go(error ? "/alerts?error=failed" : "/alerts?notice=read");
}

export async function markAllReadAction(): Promise<void> {
  const ctx = await signedIn("notificationReadByUser");
  if (!ctx) return go("/alerts?error=rateLimited");
  const { error } = await ctx.supabase.rpc("mark_notifications_read", {});
  if (error) devLog("notifications", error);
  refresh();
  return go(error ? "/alerts?error=failed" : "/alerts?notice=allRead");
}

// ---------------------------------------------------------------- settings

/** The type-by-channel grid: one checkbox per type and channel ("push:nudge"). */
export async function saveChannelsAction(formData: FormData): Promise<void> {
  const prefs = NOTIFICATION_TYPE_LIST.flatMap((type) => {
    if (isLockedType(type)) return [];
    return NOTIFICATION_CHANNELS.map((channel) => ({
      type,
      channel,
      enabled: formData.get(`${channel}:${type}`) === "on",
    }));
  });
  const ctx = await signedIn("notificationSettingsByUser");
  if (!ctx) return go(`${SETTINGS}?error=rateLimited#channels`);
  const { error } = await ctx.supabase.rpc("set_notification_preferences", { p_prefs: prefs });
  if (error) devLog("notifications", error);
  refresh();
  return go(error ? `${SETTINGS}?error=failed#channels` : `${SETTINGS}?notice=saved#channels`);
}

/** Reminder time, quiet hours, digest, discreet mode, sound and vibration. */
export async function saveTimingAction(formData: FormData): Promise<void> {
  const parsed = deliverySettingsSchema.safeParse({
    reminderTime: formData.get("reminderTime") ?? "",
    quietStart: formData.get("quietStart"),
    quietEnd: formData.get("quietEnd"),
    digest: formData.get("digest"),
    discreet: formData.get("discreet") === "on",
    sound: formData.get("sound") === "on",
    vibrate: formData.get("vibrate") === "on",
  });
  if (!parsed.success) return go(`${SETTINGS}?error=invalidInput#timing`);
  const ctx = await signedIn("notificationSettingsByUser");
  if (!ctx) return go(`${SETTINGS}?error=rateLimited#timing`);
  const v = parsed.data;
  const [{ error }, { error: reminderError }] = await Promise.all([
    ctx.supabase.rpc("update_notification_settings", {
      p_quiet_start: v.quietStart,
      p_quiet_end: v.quietEnd,
      p_digest: v.digest,
      p_discreet: v.discreet,
      p_sound: v.sound,
      p_vibrate: v.vibrate,
    }),
    ctx.supabase
      .from("notification_settings")
      .update({ reminder_time: v.reminderTime || null })
      .eq("user_id", ctx.userId),
  ]);
  if (error || reminderError) devLog("notifications", error ?? reminderError);
  refresh();
  return go(error || reminderError ? `${SETTINGS}?error=failed#timing` : `${SETTINGS}?notice=saved#timing`);
}

export async function snoozeAction(formData: FormData): Promise<void> {
  const choice = String(formData.get("for") ?? "");
  if (!(SNOOZE_CHOICES as readonly string[]).includes(choice)) return go(`${SETTINGS}?error=invalidInput#snooze`);
  const ctx = await signedIn("notificationSettingsByUser");
  if (!ctx) return go(`${SETTINGS}?error=rateLimited#snooze`);
  const { error } = await ctx.supabase.rpc("snooze_notifications", { p_for: choice });
  if (error) devLog("notifications", error);
  refresh();
  if (error) return go(`${SETTINGS}?error=failed#snooze`);
  return go(`${SETTINGS}?notice=${choice === "off" ? "awake" : "snoozed"}#snooze`);
}

/** Per-group mutes: every group is listed (hidden "group" fields); a ticked box mutes it. */
export async function saveGroupMutesAction(formData: FormData): Promise<void> {
  const groups = formData.getAll("group").map(String);
  if (groups.length > 200 || !groups.every((g) => uuidSchema.safeParse(g).success)) {
    return go(`${SETTINGS}?error=invalidInput#groups`);
  }
  const ctx = await signedIn("notificationSettingsByUser");
  if (!ctx) return go(`${SETTINGS}?error=rateLimited#groups`);
  const muted = new Set(formData.getAll("muted").map(String));
  const { data: current } = await ctx.supabase
    .from("group_members")
    .select("group_id, notifications_muted")
    .eq("user_id", ctx.userId)
    .in("group_id", groups);
  const changes = (current ?? []).filter((m) => m.notifications_muted !== muted.has(m.group_id));
  for (const m of changes) {
    const { error } = await ctx.supabase.rpc("set_group_notifications_muted", {
      p_group: m.group_id,
      p_muted: muted.has(m.group_id),
    });
    if (error) {
      devLog("notifications", error);
      return go(`${SETTINGS}?error=failed#groups`);
    }
  }
  refresh();
  return go(`${SETTINGS}?notice=saved#groups`);
}

// ---------------------------------------------------------------- email links

/** "Stop these emails" from the confirmation page: the signed link decides, no session needed. */
export async function unsubscribeAction(formData: FormData): Promise<void> {
  const link = verifyUnsubscribe(String(formData.get("k") ?? ""));
  if (!link || !(await applyUnsubscribe(link.userId, link.kind))) return go("/unsubscribe?status=invalid");
  return go("/unsubscribe?status=done");
}

/** Remove one of my devices from the settings page (push stops there). */
export async function removeDeviceAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!uuidSchema.safeParse(id).success) return go(`${SETTINGS}?error=invalidInput#devices`);
  const ctx = await signedIn("notificationSettingsByUser");
  if (!ctx) return go(`${SETTINGS}?error=rateLimited#devices`);
  const { error } = await ctx.supabase.rpc("remove_push_subscription", { p_id: id });
  if (error) devLog("notifications", error);
  refresh();
  return go(error ? `${SETTINGS}?error=failed#devices` : `${SETTINGS}?notice=deviceRemoved#devices`);
}
