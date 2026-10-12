"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { consume, type RateLimitRule } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { NUDGE_KINDS, REACTION_KINDS, SOCIAL_LIMITS } from "../constants";
import { socialErrorKey } from "../errors";
import { postBodySchema, uuidSchema } from "../schemas";

/**
 * Nudges, partners and asking for prayer (CLAUDE.md §7.7, D-082 to D-085).
 * One-button forms: each validates, rate-limits, calls the database function
 * as the person, and redirects back with ?notice= or ?error=.
 */

type Rpc = Awaited<ReturnType<typeof createSupabaseServerClient>>["rpc"];

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

function refresh() {
  revalidatePath("/[locale]", "layout");
}

const ids = (...values: string[]) => values.every((v) => uuidSchema.safeParse(v).success);
const withParam = (href: string, param: string) => `${href}${href.includes("?") ? "&" : "?"}${param}`;

async function signedIn(rule: RateLimitRule): Promise<{ userId: string; rpc: Rpc } | null> {
  const { userId } = await requireAccount();
  if (!(await consume(rule, userId)).ok) return null;
  const supabase = await createSupabaseServerClient();
  return { userId, rpc: supabase.rpc.bind(supabase) as Rpc };
}

/** Pages a nudge or partner form can come back to (never anywhere else). */
function backTo(groupId: string, from: FormDataEntryValue | null): string {
  switch (from) {
    case "members":
      return `/groups/${groupId}/members`;
    case "partner":
      return `/groups/${groupId}/partner`;
    case "settings":
      return `/groups/${groupId}/settings`;
    default:
      return `/groups/${groupId}`;
  }
}

// ---------------------------------------------------------------- nudges

export async function nudgeAction(groupId: string, formData: FormData): Promise<void> {
  const back = backTo(groupId, formData.get("from"));
  const userId = String(formData.get("userId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!ids(groupId, userId) || !(NUDGE_KINDS as readonly string[]).includes(kind)) {
    return go(withParam(back, "error=invalidInput"));
  }
  const ctx = await signedIn("nudgeByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("send_nudge", { p_group: groupId, p_to: userId, p_kind: kind });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : "notice=nudged"));
}

/** Nudges in this group, from the group's settings page. */
export async function groupNudgeSettingsAction(groupId: string, formData: FormData): Promise<void> {
  const back = `/groups/${groupId}/settings`;
  if (!ids(groupId)) return go(withParam(back, "error=notFound"));
  const ctx = await signedIn("groupManageByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("set_group_nudges_muted", {
    p_group: groupId,
    p_muted: formData.get("muted") === "on",
  });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : "notice=nudgeSettingsSaved"));
}

/** Settings: nudges everywhere, and milestone cards. */
export async function socialSettingsAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount();
  if (!(await consume("profileSaveByUser", userId)).ok) return go("/settings?error=rateLimited");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("privacy_settings")
    .update({
      nudges_muted: formData.get("nudgesMuted") === "on",
      milestone_cards: formData.get("milestoneCards") === "on",
    })
    .eq("user_id", userId);
  refresh();
  return go(error ? "/settings?error=saveFailed" : "/settings?notice=nudgeSettingsSaved#social-settings");
}

// ---------------------------------------------------------------- partners

export async function requestPartnerAction(groupId: string, formData: FormData): Promise<void> {
  const back = backTo(groupId, formData.get("from"));
  const userId = String(formData.get("userId") ?? "");
  if (!ids(groupId, userId)) return go(withParam(back, "error=memberNotFound"));
  const ctx = await signedIn("partnerByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("request_partner", { p_group: groupId, p_user: userId });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : "notice=partnerAsked"));
}

const responses = {
  accept: { fn: "respond_partner", accept: true, notice: "partnerAccepted" },
  decline: { fn: "respond_partner", accept: false, notice: "partnerDeclined" },
  withdraw: { fn: "respond_partner", accept: false, notice: "partnerWithdrawn" },
  end: { fn: "end_partnership", notice: "partnerEnded" },
} as const;

/** Accept, decline, withdraw or end, from the Partner page. */
export async function partnerAction(groupId: string, formData: FormData): Promise<void> {
  const back = `/groups/${groupId}/partner`;
  const id = String(formData.get("partnershipId") ?? "");
  const op = responses[String(formData.get("op") ?? "") as keyof typeof responses];
  if (!op || !ids(groupId, id)) return go(withParam(back, "error=partnershipNotFound"));
  const ctx = await signedIn("partnerByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } =
    op.fn === "respond_partner"
      ? await ctx.rpc(op.fn, { p_partnership: id, p_accept: op.accept })
      : await ctx.rpc(op.fn, { p_partnership: id });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : `notice=${op.notice}`));
}

export async function partnerAlertsAction(groupId: string, formData: FormData): Promise<void> {
  const back = `/groups/${groupId}/partner`;
  const id = String(formData.get("partnershipId") ?? "");
  if (!ids(groupId, id)) return go(withParam(back, "error=partnershipNotFound"));
  const ctx = await signedIn("partnerByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("set_partner_alerts", {
    p_partnership: id,
    p_allow: formData.get("allow") === "on",
  });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : "notice=alertsSaved"));
}

// ---------------------------------------------------------------- asking for prayer (the slip page, D-046)

/**
 * The slip page lives at /check-in/done for both answers (D-055), so it comes
 * back there with ?date= and a neutral ?prayer= result.
 */
function donePage(formData: FormData, param: string): string {
  const date = String(formData.get("date") ?? "");
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  return `/check-in/done?${safeDate ? `date=${safeDate}&` : ""}${param}#prayer-title`;
}

export async function askGroupToPrayAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get("groupId") ?? "");
  const parsed = postBodySchema.safeParse(String(formData.get("body") ?? ""));
  if (!ids(groupId) || !parsed.success || parsed.data.length > SOCIAL_LIMITS.postMax) {
    return go(donePage(formData, "prayer=invalidInput"));
  }
  const ctx = await signedIn("wallPostByUser");
  if (!ctx) return go(donePage(formData, "prayer=rateLimited"));
  const { error } = await ctx.rpc("create_post", { p_group: groupId, p_kind: "prayer_request", p_body: parsed.data });
  refresh();
  return go(donePage(formData, `prayer=${error ? socialErrorKey(error) : "askedGroup"}`));
}

export async function askPartnerToPrayAction(formData: FormData): Promise<void> {
  // One button per partner: value "<group id>:<partner id>".
  const [groupId = "", userId = ""] = String(formData.get("target") ?? "").split(":");
  if (!ids(groupId, userId)) return go(donePage(formData, "prayer=invalidInput"));
  const ctx = await signedIn("nudgeByUser");
  if (!ctx) return go(donePage(formData, "prayer=rateLimited"));
  const { error } = await ctx.rpc("send_nudge", { p_group: groupId, p_to: userId, p_kind: "pray_for_me" });
  refresh();
  return go(donePage(formData, `prayer=${error ? socialErrorKey(error) : "askedPartner"}`));
}

// ---------------------------------------------------------------- reactions on check-ins (D-087)

/** A reaction button on a member's row in Today: value "<kind>:1" to add, "<kind>:0" to take back. */
export async function reactCheckinAction(groupId: string, formData: FormData): Promise<void> {
  const checkinId = String(formData.get("checkinId") ?? "");
  const [kind = "", on] = String(formData.get("reaction") ?? "").split(":");
  if (!ids(groupId, checkinId) || !(REACTION_KINDS as readonly string[]).includes(kind)) {
    return go(`/groups/${groupId}?error=invalidInput`);
  }
  const ctx = await signedIn("reactionByUser");
  if (!ctx) return go(`/groups/${groupId}?error=rateLimited`);
  const { error } = await ctx.rpc("react_to_checkin", {
    p_group: groupId,
    p_checkin: checkinId,
    p_kind: kind,
    p_on: on === "1",
  });
  refresh();
  if (error) return go(`/groups/${groupId}?error=${socialErrorKey(error)}`);
}
