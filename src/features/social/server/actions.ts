"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { consume, type RateLimitRule } from "@/lib/security/rate-limit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { socialErrorKey } from "../errors";
import type { SocialErrorKey, SocialFormState } from "../form-state";
import { commentBodySchema, postBodySchema, postSchema, reactionSchema, reportSchema, uuidSchema } from "../schemas";

/**
 * The wall's writes (CLAUDE.md §7.7, §7.11). Each one validates the form,
 * rate-limits, and calls a database function as the person; the function
 * checks membership, blocks and roles again, and runs the automatic filter
 * (D-077 to D-080). Text forms return a state (the typed text comes back on
 * an error); one-button forms redirect with ?notice= or ?error=.
 */

type Rpc = Awaited<ReturnType<typeof createSupabaseServerClient>>["rpc"];

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

/** Wall changes show on the group's pages and its home; refresh the app's pages. */
function refresh() {
  revalidatePath("/[locale]", "layout");
}

async function signedIn(rule: RateLimitRule): Promise<{ rpc: Rpc } | null> {
  const { userId } = await requireAccount();
  if (!(await consume(rule, userId)).ok) return null;
  const supabase = await createSupabaseServerClient();
  return { rpc: supabase.rpc.bind(supabase) as Rpc };
}

const failed = (error: SocialErrorKey, body?: string, kind?: string): SocialFormState => ({
  status: "error",
  error,
  body,
  kind,
});

const ids = (...values: string[]) => values.every((v) => uuidSchema.safeParse(v).success);

/** Where a one-button form came from; only these pages, so a form can't send anyone elsewhere. */
function backTo(groupId: string, formData: FormData, postId?: string): string {
  switch (formData.get("from")) {
    case "post":
      return postId ? `/groups/${groupId}/wall/${postId}` : `/groups/${groupId}/wall`;
    case "home":
      return `/groups/${groupId}`;
    case "members":
      return `/groups/${groupId}/members`;
    case "moderation":
      return `/groups/${groupId}/moderation`;
    default:
      return `/groups/${groupId}/wall`;
  }
}

const withParam = (href: string, param: string) => `${href}${href.includes("?") ? "&" : "?"}${param}`;

// ---------------------------------------------------------------- posts

export async function createPostAction(
  groupId: string,
  _prev: SocialFormState,
  formData: FormData,
): Promise<SocialFormState> {
  const raw = { kind: String(formData.get("kind") ?? ""), body: String(formData.get("body") ?? "") };
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message as SocialErrorKey | undefined;
    return failed(issue ?? "invalidInput", raw.body, raw.kind);
  }
  if (!ids(groupId)) return failed("notFound", raw.body, raw.kind);
  const ctx = await signedIn("wallPostByUser");
  if (!ctx) return failed("rateLimited", raw.body, raw.kind);
  const { error } = await ctx.rpc("create_post", {
    p_group: groupId,
    p_kind: parsed.data.kind,
    p_body: parsed.data.body,
  });
  if (error) {
    devLog("social", error.message);
    return failed(socialErrorKey(error), raw.body, raw.kind);
  }
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function editPostAction(
  postId: string,
  _prev: SocialFormState,
  formData: FormData,
): Promise<SocialFormState> {
  const body = String(formData.get("body") ?? "");
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) return failed((parsed.error.issues[0]?.message as SocialErrorKey) ?? "invalidInput", body);
  if (!ids(postId)) return failed("postNotFound", body);
  const ctx = await signedIn("wallPostByUser");
  if (!ctx) return failed("rateLimited", body);
  const { error } = await ctx.rpc("edit_post", { p_post: postId, p_body: parsed.data });
  if (error) return failed(socialErrorKey(error), body);
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

/** Delete my post, or (an admin) remove someone else's. */
export async function deletePostAction(groupId: string, postId: string, formData: FormData): Promise<void> {
  // The post's own page is gone afterwards, so from there go back to the wall.
  const from = formData.get("from");
  const target =
    from === "home"
      ? `/groups/${groupId}`
      : from === "moderation"
        ? `/groups/${groupId}/moderation`
        : `/groups/${groupId}/wall`;
  if (!ids(groupId, postId)) return go(withParam(target, "error=postNotFound"));
  const ctx = await signedIn("wallPostByUser");
  if (!ctx) return go(withParam(target, "error=rateLimited"));
  const { error } = await ctx.rpc("delete_post", { p_post: postId });
  refresh();
  return go(withParam(target, error ? `error=${socialErrorKey(error)}` : "notice=postDeleted"));
}

/** Pin or unpin an announcement (owners and admins, three at most). */
export async function pinPostAction(groupId: string, postId: string, formData: FormData): Promise<void> {
  const back = backTo(groupId, formData, postId);
  if (!ids(groupId, postId)) return go(withParam(back, "error=postNotFound"));
  const ctx = await signedIn("wallPostByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const pinned = formData.get("pinned") === "1";
  const { error } = await ctx.rpc("pin_post", { p_post: postId, p_pinned: pinned });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : `notice=${pinned ? "pinned" : "unpinned"}`));
}

// ---------------------------------------------------------------- comments

export async function createCommentAction(
  postId: string,
  _prev: SocialFormState,
  formData: FormData,
): Promise<SocialFormState> {
  const body = String(formData.get("body") ?? "");
  const parsed = commentBodySchema.safeParse(body);
  if (!parsed.success) return failed((parsed.error.issues[0]?.message as SocialErrorKey) ?? "invalidInput", body);
  if (!ids(postId)) return failed("postNotFound", body);
  const ctx = await signedIn("wallCommentByUser");
  if (!ctx) return failed("rateLimited", body);
  const { error } = await ctx.rpc("create_comment", { p_post: postId, p_body: parsed.data });
  if (error) return failed(socialErrorKey(error), body);
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function editCommentAction(
  commentId: string,
  _prev: SocialFormState,
  formData: FormData,
): Promise<SocialFormState> {
  const body = String(formData.get("body") ?? "");
  const parsed = commentBodySchema.safeParse(body);
  if (!parsed.success) return failed((parsed.error.issues[0]?.message as SocialErrorKey) ?? "invalidInput", body);
  if (!ids(commentId)) return failed("postNotFound", body);
  const ctx = await signedIn("wallCommentByUser");
  if (!ctx) return failed("rateLimited", body);
  const { error } = await ctx.rpc("edit_comment", { p_comment: commentId, p_body: parsed.data });
  if (error) return failed(socialErrorKey(error), body);
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function deleteCommentAction(groupId: string, postId: string, commentId: string): Promise<void> {
  const back = `/groups/${groupId}/wall/${postId}`;
  if (!ids(groupId, postId, commentId)) return go(withParam(back, "error=postNotFound"));
  const ctx = await signedIn("wallCommentByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("delete_comment", { p_comment: commentId });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : "notice=commentDeleted"));
}

// ---------------------------------------------------------------- reactions

/**
 * A reaction button: name="reaction", value "<kind>:1" to add or "<kind>:0"
 * to take back. No redirect on success, so with JavaScript the page updates
 * in place and focus stays on the button; without it, the page reloads.
 */
export async function reactAction(groupId: string, formData: FormData): Promise<void> {
  const [kind, on] = String(formData.get("reaction") ?? "").split(":");
  const parsed = reactionSchema.safeParse({
    targetType: formData.get("targetType"),
    target: formData.get("target"),
    kind,
    on,
  });
  const postId = String(formData.get("postId") ?? "");
  const back = backTo(groupId, formData, ids(postId) ? postId : undefined);
  if (!parsed.success || !ids(groupId)) return go(withParam(back, "error=invalidInput"));
  const ctx = await signedIn("reactionByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("set_reaction", {
    p_target_type: parsed.data.targetType,
    p_target: parsed.data.target,
    p_kind: parsed.data.kind,
    p_on: parsed.data.on,
  });
  refresh();
  if (error) return go(withParam(back, `error=${socialErrorKey(error)}`));
}

// ---------------------------------------------------------------- report and block

export async function reportAction(groupId: string, formData: FormData): Promise<void> {
  const postId = String(formData.get("postId") ?? "");
  const back = backTo(groupId, formData, ids(postId) ? postId : undefined);
  const parsed = reportSchema.safeParse({
    targetType: formData.get("targetType"),
    target: formData.get("target"),
    reason: formData.get("reason") ?? "",
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success || !ids(groupId)) {
    const key = parsed.success ? "invalidInput" : (parsed.error.issues[0]?.message as SocialErrorKey);
    return go(withParam(back, `error=${key === "reasonMissing" || key === "noteTooLong" ? key : "invalidInput"}`));
  }
  const ctx = await signedIn("reportByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("report_content", {
    p_group: groupId,
    p_target_type: parsed.data.targetType,
    p_target: parsed.data.target,
    p_reason: parsed.data.reason,
    p_note: (parsed.data.note || null) as string,
  });
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : "notice=reported"));
}

/** Block someone you share a group with. They leave the page you were on, so go back to the wall. */
export async function blockAction(groupId: string, formData: FormData): Promise<void> {
  const userId = String(formData.get("userId") ?? "");
  const back = formData.get("from") === "members" ? `/groups/${groupId}/members` : `/groups/${groupId}/wall`;
  if (!ids(groupId, userId)) return go(withParam(back, "error=memberNotFound"));
  const ctx = await signedIn("blockByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("block_member", { p_user: userId });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : "notice=blocked"));
}

export async function unblockAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("userId") ?? "");
  const back = "/settings/blocked";
  if (!ids(userId)) return go(withParam(back, "error=memberNotFound"));
  const ctx = await signedIn("blockByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("unblock_member", { p_user: userId });
  refresh();
  return go(withParam(back, error ? `error=${socialErrorKey(error)}` : "notice=unblocked"));
}

/** An admin closes a report: actioned or dismissed. */
export async function resolveReportAction(groupId: string, formData: FormData): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "");
  const outcome = formData.get("outcome") === "actioned" ? "actioned" : "dismissed";
  const back = `/groups/${groupId}/moderation`;
  if (!ids(groupId, reportId)) return go(withParam(back, "error=notFound"));
  const ctx = await signedIn("reportByUser");
  if (!ctx) return go(withParam(back, "error=rateLimited"));
  const { error } = await ctx.rpc("resolve_report", { p_report: reportId, p_outcome: outcome });
  refresh();
  return go(
    withParam(
      back,
      error ? `error=${socialErrorKey(error)}` : `notice=report${outcome === "actioned" ? "Actioned" : "Dismissed"}`,
    ),
  );
}
