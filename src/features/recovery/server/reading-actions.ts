"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { consume } from "@/lib/security/rate-limit";
import { setFlash } from "@/lib/server/flash";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { planBySlug, planDaySchema, planSlugSchema } from "../reading";
import { journalFlashDate } from "./queries";

/**
 * Reading plans (CLAUDE.md §7.9, D-112). Plain forms that come back to the
 * very same address, with the result in the one-minute cookie (D-098). The
 * addresses carry only a neutral plan slug and a day number.
 */

const today = journalFlashDate;

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

/** Where to come back to: /reading, or the plan's page (with the day being read). */
function backTo(formData: FormData): string {
  const back = String(formData.get("back") ?? "");
  const plan = planBySlug(String(formData.get("plan") ?? ""));
  if (back === "plan" && plan) {
    const day = planDaySchema.safeParse(formData.get("day"));
    return day.success && day.data <= plan.length ? `/reading/${plan.slug}?day=${day.data}` : `/reading/${plan.slug}`;
  }
  return "/reading";
}

async function readingRpc(
  formData: FormData,
  run: (plan: string, day: number) => PromiseLike<{ error: unknown }>,
  okCode: string,
): Promise<never> {
  const { userId } = await requireAccount();
  const back = backTo(formData);
  const plan = planSlugSchema.safeParse(formData.get("plan"));
  const day = planDaySchema.safeParse(formData.get("day") ?? "1");
  if (!plan.success || !day.success) {
    await setFlash(today(), "error", "readingFailed");
    return go(back);
  }
  if (!(await consume("readingByUser", userId)).ok) {
    await setFlash(today(), "error", "rateLimited");
    return go(back);
  }
  const { error } = await run(plan.data, day.data);
  await setFlash(today(), error ? "error" : "saved", error ? "readingFailed" : okCode);
  revalidatePath("/[locale]/reading", "layout");
  return go(back);
}

export async function startPlanAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await readingRpc(formData, (plan) => supabase.rpc("start_reading_plan", { p_plan: plan }), "planStarted");
}

export async function markReadAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await readingRpc(formData, (plan, day) => supabase.rpc("mark_day_read", { p_plan: plan, p_day: day }), "dayRead");
}

export async function unmarkReadAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await readingRpc(formData, (plan, day) => supabase.rpc("unmark_day_read", { p_plan: plan, p_day: day }), "dayUnread");
}
