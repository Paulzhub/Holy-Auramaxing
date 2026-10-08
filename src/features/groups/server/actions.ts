"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { imageErrorKeys, type ImageFormState } from "@/components/image-picker/state";
import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { siteOrigin } from "@/lib/env";
import { processSquareImage, SquareImageError } from "@/lib/images/square-image";
import { consume, refund } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request-info";
import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { errorField, groupErrorKey } from "../errors";
import type { GroupErrorKey, GroupFormState, InviteFormState } from "../form-state";
import {
  formatInviteCode,
  generateInviteCode,
  generateInviteToken,
  hashInviteCode,
  hashInviteToken,
  inviteLink,
  normaliseInviteCode,
} from "../invite-secrets";
import { renderInviteQr } from "../qr";
import {
  challengeFieldNames,
  covenantSchema,
  createGroupFields,
  createGroupSchema,
  groupChallengeSchema,
  groupDetailsSchema,
  inviteSchema,
  joinSchema,
  membershipSchema,
  parseForm,
  uuidSchema,
} from "../schemas";
import { dropHeldInvite, holdInvite, readHeldInvite } from "./invite-cookie";
import { removeGroupPicture, screenPendingGroupPicture, storePendingGroupPicture } from "./picture";

/**
 * Every group change goes through a database function that checks the
 * person's role in that group (D-034); these actions validate the form,
 * rate-limit, call it as the person, and report back. Forms with fields
 * return a state; one-button forms redirect with ?notice= or ?error=.
 */

type Rpc = Awaited<ReturnType<typeof createSupabaseServerClient>>["rpc"];

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  // redirect() throws; this line is never reached.
  throw new Error("unreachable");
}

function fail(key: GroupErrorKey): GroupFormState {
  const field = errorField(key);
  return field ? { status: "error", fieldErrors: { [field]: key } } : { status: "error", formError: key };
}

/** The generated types can't express a SQL null argument; PostgREST sends JSON null. */
function sqlNull<T>(value: T | null): T {
  return value as T;
}

/** Group changes show in the header's switcher on every page, so refresh the whole app. */
function refresh() {
  revalidatePath("/[locale]", "layout");
}

async function managing(groupId: string): Promise<{ userId: string; rpc: Rpc } | null> {
  const { userId } = await requireAccount();
  if (!uuidSchema.safeParse(groupId).success) return null;
  if (!(await consume("groupManageByUser", userId)).ok) return null;
  const supabase = await createSupabaseServerClient();
  return { userId, rpc: supabase.rpc.bind(supabase) as Rpc };
}

// ---------------------------------------------------------------- create

export async function createGroupAction(_prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const { userId } = await requireAccount();
  const parsed = parseForm(createGroupSchema, formData, createGroupFields);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  if (!(await consume("groupCreateByUser", userId)).ok) return fail("rateLimited");
  const v = parsed.values;

  const supabase = await createSupabaseServerClient();
  const { data: groupId, error } = await supabase.rpc("create_group", {
    p_name: v.name,
    p_description: v.description ?? "",
    p_challenge_type: v.challengeType,
    p_challenge_days: sqlNull(v.customDays),
    p_start_date: v.startDate,
    p_timezone: v.timezone,
    p_max_members: v.maxMembers,
    p_join_policy: v.joinPolicy,
    p_covenant_text: v.covenant,
    p_min_share_level: v.minShareLevel,
    p_leaderboard_hiding_allowed: v.hidingAllowed,
    p_my_share_level: v.myShareLevel,
  });
  if (error || !groupId) {
    devLog("groups", error?.message);
    return fail(groupErrorKey(error));
  }
  refresh();
  return go(`/groups/${groupId}?notice=created`);
}

// ---------------------------------------------------------------- settings

export async function saveGroupDetailsAction(
  groupId: string,
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const parsed = parseForm(groupDetailsSchema, formData, ["name", "description"]);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const ctx = await managing(groupId);
  if (!ctx) return fail("rateLimited");
  const { error } = await ctx.rpc("update_group_details", {
    p_group: groupId,
    p_name: parsed.values.name,
    p_description: parsed.values.description ?? "",
  });
  if (error) return fail(groupErrorKey(error));
  refresh();
  return { status: "saved" };
}

export async function saveGroupChallengeAction(
  groupId: string,
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const parsed = parseForm(groupChallengeSchema, formData, challengeFieldNames);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const ctx = await managing(groupId);
  if (!ctx) return fail("rateLimited");
  const v = parsed.values;
  const { error } = await ctx.rpc("update_group_challenge", {
    p_group: groupId,
    p_challenge_type: v.challengeType,
    p_challenge_days: sqlNull(v.customDays),
    p_start_date: v.startDate,
    p_timezone: v.timezone,
    p_max_members: v.maxMembers,
    p_join_policy: v.joinPolicy,
  });
  if (error) return fail(groupErrorKey(error));
  refresh();
  return { status: "saved" };
}

export async function saveCovenantAction(
  groupId: string,
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const parsed = parseForm(covenantSchema, formData, ["covenant", "minShareLevel", "hidingAllowed"]);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const ctx = await managing(groupId);
  if (!ctx) return fail("rateLimited");
  const { data: outcome, error } = await ctx.rpc("change_group_covenant", {
    p_group: groupId,
    p_covenant_text: parsed.values.covenant,
    p_min_share_level: parsed.values.minShareLevel,
    p_leaderboard_hiding_allowed: parsed.values.hidingAllowed,
  });
  if (error) return fail(groupErrorKey(error));
  refresh();
  return { status: "saved", outcome: outcome ?? "unchanged" };
}

export async function saveMembershipAction(
  groupId: string,
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const parsed = parseForm(membershipSchema, formData, ["shareLevel", "leaderboardHidden"]);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const ctx = await managing(groupId);
  if (!ctx) return fail("rateLimited");
  const { error } = await ctx.rpc("update_my_group_membership", {
    p_group: groupId,
    p_share_level: parsed.values.shareLevel,
    p_leaderboard_hidden: parsed.values.leaderboardHidden,
  });
  if (error) return fail(groupErrorKey(error));
  refresh();
  return { status: "saved" };
}

// ---------------------------------------------------------------- picture

export async function uploadGroupPictureAction(
  groupId: string,
  _prev: ImageFormState,
  formData: FormData,
): Promise<ImageFormState> {
  const { userId } = await requireAccount();
  if (!uuidSchema.safeParse(groupId).success) return { status: "error", error: "saveFailed" };
  const file = formData.get("picture");
  if (!(file instanceof File) || file.size === 0) return { status: "error", error: "avatarType" };
  if (!(await consume("groupPictureByUser", userId)).ok) return { status: "error", error: "rateLimited" };

  let renditions;
  try {
    renditions = await processSquareImage(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    devLog("group-picture", error);
    return {
      status: "error",
      error: error instanceof SquareImageError ? imageErrorKeys[error.reason] : "avatarUnreadable",
    };
  }
  try {
    await storePendingGroupPicture(groupId, userId, renditions);
  } catch (error) {
    devLog("group-picture", error);
    return { status: "error", error: "saveFailed" };
  }
  // Screening calls an outside service, so it never holds up the response.
  after(() => screenPendingGroupPicture(groupId));
  refresh();
  return { status: "uploaded" };
}

export async function removeGroupPictureAction(groupId: string): Promise<ImageFormState> {
  await requireAccount();
  if (!uuidSchema.safeParse(groupId).success) return { status: "error", error: "saveFailed" };
  try {
    await removeGroupPicture(groupId);
  } catch (error) {
    devLog("group-picture", error);
    return { status: "error", error: "saveFailed" };
  }
  refresh();
  return { status: "removed" };
}

// ---------------------------------------------------------------- invites

async function makeInvite(groupId: string, expiresInDays: number, maxUses: number | null): Promise<InviteFormState> {
  const { userId } = await requireAccount();
  if (!uuidSchema.safeParse(groupId).success) return fail("notFound");
  if (!(await consume("groupInviteByUser", userId)).ok) return fail("rateLimited");

  const token = generateInviteToken();
  const code = generateInviteCode();
  const supabase = await createSupabaseServerClient();
  const { data: inviteId, error } = await supabase.rpc("create_group_invite", {
    p_group: groupId,
    p_token_hash: hashInviteToken(token),
    p_code_hash: hashInviteCode(code),
    p_expires_in_days: expiresInDays,
    p_max_uses: sqlNull(maxUses),
  });
  if (error || !inviteId) return fail(groupErrorKey(error));

  const t = await getTranslations("groups.invites");
  const link = inviteLink(siteOrigin(), token);
  refresh();
  // The only time the link and code exist outside the person's own screen.
  return {
    status: "saved",
    invite: {
      link,
      code: formatInviteCode(code),
      qrSvg: renderInviteQr(link, t("qrLabel")).svg,
      expiresAt: new Date(Date.now() + expiresInDays * 86_400_000).toISOString(),
      maxUses,
    },
  };
}

export async function createInviteAction(
  groupId: string,
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = parseForm(inviteSchema, formData, ["expiresInDays", "maxUses"]);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  return makeInvite(groupId, parsed.values.expiresInDays, parsed.values.maxUses);
}

/** Stops an invite and makes a new one with the same settings. */
export async function replaceInviteAction(
  groupId: string,
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const inviteId = String(formData.get("inviteId") ?? "");
  const ctx = await managing(groupId);
  if (!ctx || !uuidSchema.safeParse(inviteId).success) return fail("rateLimited");
  const supabase = await createSupabaseServerClient();
  const { data: old } = await supabase
    .from("group_invites")
    .select("created_at, expires_at, max_uses")
    .eq("id", inviteId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (!old) return fail("inviteInvalid");
  const { error } = await ctx.rpc("revoke_group_invite", { p_invite: inviteId });
  if (error) return fail(groupErrorKey(error));
  const days = Math.round((Date.parse(old.expires_at) - Date.parse(old.created_at)) / 86_400_000);
  return makeInvite(groupId, Math.min(30, Math.max(1, days)), old.max_uses);
}

export async function revokeInviteAction(groupId: string, formData: FormData): Promise<void> {
  const inviteId = String(formData.get("inviteId") ?? "");
  const ctx = await managing(groupId);
  if (!ctx || !uuidSchema.safeParse(inviteId).success) return go(`/groups/${groupId}/invites?error=rateLimited`);
  const { error } = await ctx.rpc("revoke_group_invite", { p_invite: inviteId });
  refresh();
  return go(`/groups/${groupId}/invites?${error ? `error=${groupErrorKey(error)}` : "notice=inviteRevoked"}`);
}

// ---------------------------------------------------------------- members

const memberOps = {
  promote: { fn: "set_group_member_role", role: "admin", notice: "roleChanged" },
  demote: { fn: "set_group_member_role", role: "member", notice: "roleChanged" },
  remove: { fn: "remove_group_member", notice: "removed" },
  allowBack: { fn: "allow_group_member_back", notice: "allowedBack" },
  approve: { fn: "approve_join_request", notice: "approved" },
  decline: { fn: "decline_join_request", notice: "declined" },
  transfer: { fn: "transfer_group_ownership", notice: "transferred" },
} as const;
type MemberOp = keyof typeof memberOps;

/** One-button member actions on the Members page (and handing over ownership in Settings). */
export async function memberAction(groupId: string, formData: FormData): Promise<void> {
  const op = String(formData.get("op") ?? "") as MemberOp;
  const target = String(formData.get("userId") ?? "");
  const from = formData.get("from") === "settings" ? "settings" : "members";
  const back = `/groups/${groupId}/${from}`;
  const spec = memberOps[op];
  const ctx = await managing(groupId);
  if (!spec || !ctx || !uuidSchema.safeParse(target).success) return go(`${back}?error=rateLimited`);

  const { error } =
    spec.fn === "set_group_member_role"
      ? await ctx.rpc(spec.fn, { p_group: groupId, p_user: target, p_role: "role" in spec ? spec.role : "member" })
      : spec.fn === "transfer_group_ownership"
        ? await ctx.rpc(spec.fn, { p_group: groupId, p_new_owner: target })
        : await ctx.rpc(spec.fn, { p_group: groupId, p_user: target });
  refresh();
  return go(`${back}?${error ? `error=${groupErrorKey(error)}` : `notice=${spec.notice}`}`);
}

/** Leave a group, or withdraw a request to join it. */
export async function leaveGroupAction(groupId: string, formData: FormData): Promise<void> {
  const withdrawing = formData.get("withdraw") === "yes";
  const ctx = await managing(groupId);
  if (!ctx) return go(`/groups?error=rateLimited`);
  const { error } = await ctx.rpc("leave_group", { p_group: groupId });
  refresh();
  if (error) {
    return go(
      withdrawing
        ? `/groups?error=${groupErrorKey(error)}`
        : `/groups/${groupId}/settings?error=${groupErrorKey(error)}`,
    );
  }
  return go(`/groups?notice=${withdrawing ? "withdrawn" : "left"}`);
}

export async function archiveGroupAction(groupId: string, formData: FormData): Promise<void> {
  const restore = formData.get("restore") === "yes";
  const ctx = await managing(groupId);
  if (!ctx) return go(`/groups/${groupId}/settings?error=rateLimited`);
  const { error } = await ctx.rpc(restore ? "unarchive_group" : "archive_group", { p_group: groupId });
  refresh();
  return go(
    `/groups/${groupId}/settings?${error ? `error=${groupErrorKey(error)}` : `notice=${restore ? "unarchived" : "archived"}`}`,
  );
}

export async function deleteGroupAction(groupId: string, formData: FormData): Promise<void> {
  const ctx = await managing(groupId);
  if (!ctx) return go(`/groups/${groupId}/settings?error=rateLimited#delete`);
  const { error } = await ctx.rpc("delete_group", {
    p_group: groupId,
    p_confirm_name: String(formData.get("confirmName") ?? "").slice(0, 100),
  });
  refresh();
  if (error) return go(`/groups/${groupId}/settings?error=${groupErrorKey(error)}#delete`);
  return go("/groups?notice=deleted");
}

// ---------------------------------------------------------------- covenant changes

export async function proposalAction(groupId: string, formData: FormData): Promise<void> {
  const op = String(formData.get("op") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const back = formData.get("from") === "settings" ? `/groups/${groupId}/settings` : `/groups/${groupId}`;
  const ctx = await managing(groupId);
  if (!ctx || !uuidSchema.safeParse(proposalId).success) return go(`${back}?error=rateLimited`);

  let notice: string;
  let error: { message: string } | null;
  if (op === "agree") {
    const result = await ctx.rpc("agree_to_covenant_change", { p_proposal: proposalId });
    error = result.error;
    notice = result.data ? "covenantNowApplies" : "covenantAgreed";
  } else if (op === "decline") {
    ({ error } = await ctx.rpc("decline_covenant_change", { p_proposal: proposalId }));
    notice = "covenantDeclined";
  } else {
    ({ error } = await ctx.rpc("withdraw_covenant_change", { p_proposal: proposalId }));
    notice = "covenantWithdrawn";
  }
  refresh();
  return go(`${back}?${error ? `error=${groupErrorKey(error)}` : `notice=${notice}`}`);
}

// ---------------------------------------------------------------- joining

export async function joinGroupAction(_prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const { userId } = await requireAccount();
  const held = await readHeldInvite();
  if (!held) return fail("inviteInvalid");

  const parsed = parseForm(joinSchema, formData, ["shareLevel", "leaderboardHidden", "accept", "covenantSeen"]);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };

  const [byUser, byIp] = await Promise.all([
    consume("groupJoinByUser", userId),
    consume("groupJoinByIp", await clientIp()),
  ]);
  if (!byUser.ok || !byIp.ok) return fail("rateLimited");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("join_group", {
      p_token_hash: held.tokenHash ?? "",
      p_code_hash: held.codeHash ?? "",
      p_share_level: parsed.values.shareLevel,
      p_leaderboard_hidden: parsed.values.leaderboardHidden,
      p_accept_covenant: parsed.values.accept,
      p_covenant_seen: parsed.values.covenantSeen,
    })
    .maybeSingle();
  // The cookie stays on failure, so the join page can explain the invite's state.
  if (error || !data) return fail(groupErrorKey(error));

  await dropHeldInvite();
  refresh();
  if (data.status === "pending") return go("/groups?notice=requested");
  return go(`/groups/${data.group_id}?notice=joined`);
}

/**
 * "Join with a code": checks the code, keeps it (as a keyed hash) like a
 * link would, and opens the join page. Wrong codes are limited to 5 per
 * person and 20 per network in 15 minutes (D-037).
 */
export async function enterInviteCodeAction(_prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const { userId } = await requireAccount();
  const ip = await clientIp();
  // Put the typed code back on every refusal, so a typo can be fixed in place.
  const typed = String(formData.get("code") ?? "").slice(0, 20);
  const values = { code: typed };
  const code = normaliseInviteCode(typed);
  if (!code) return { status: "error", fieldErrors: { code: "codeInvalid" }, values };

  // Count the try before looking it up, and give it back if the code works:
  // codes sent all at once can't all slip past the limit (D-053).
  const counted = await Promise.all([
    consume("inviteCodeFailuresByUser", userId),
    consume("inviteCodeFailuresByIp", ip),
  ]);
  if (counted.some((r) => !r.ok)) {
    await audit("group.invite_code_rate_limited", userId);
    return { status: "error", fieldErrors: { code: "codeRateLimited" }, values };
  }

  const hash = hashInviteCode(code);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("preview_group_invite", { p_token_hash: "", p_code_hash: hash }).maybeSingle();
  if (!data || data.status === "invalid") {
    return { status: "error", fieldErrors: { code: "inviteInvalid" }, values };
  }
  await Promise.all([refund("inviteCodeFailuresByUser", userId), refund("inviteCodeFailuresByIp", ip)]);
  await holdInvite("code", hash);
  return go("/join");
}
