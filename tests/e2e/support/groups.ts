import { createHash, randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createConfirmedUser, strongPassword, supabaseUrl, uniqueEmail } from "./supabase";

/**
 * Group helpers for the e2e suite. `memberClient` signs in with the
 * publishable key, exactly as anyone could call the API directly: these
 * clients are how the isolation tests try to reach another group.
 */

const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export interface Member {
  email: string;
  password: string;
  userId: string;
  client: SupabaseClient;
}

/** An API client signed in as an existing account (e.g. one signed in through the browser too). */
export async function apiAs(account: { email: string; password: string; userId: string }): Promise<Member> {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw error;
  return { ...account, client };
}

export async function newMember(label: string): Promise<Member> {
  const email = uniqueEmail(label);
  const password = strongPassword();
  const userId = await createConfirmedUser(email, password);
  return apiAs({ email, password, userId });
}

export async function createGroupAs(
  member: Member,
  name: string,
  options: { joinPolicy?: "invite_only" | "request_to_join"; minShareLevel?: string; hiding?: boolean } = {},
): Promise<string> {
  const { data, error } = await member.client.rpc("create_group", {
    p_name: name,
    p_description: "",
    p_challenge_type: "40",
    p_challenge_days: null,
    p_start_date: new Date().toISOString().slice(0, 10),
    p_timezone: "UTC",
    p_max_members: 50,
    p_join_policy: options.joinPolicy ?? "invite_only",
    p_covenant_text: "We walk together in grace and honesty.",
    p_min_share_level: options.minShareLevel ?? "checkin_only",
    p_leaderboard_hiding_allowed: options.hiding ?? true,
    p_my_share_level: "full",
  });
  if (error) throw error;
  return data as string;
}

/** Makes an invite the way the app does, and returns the link token. */
export async function createInviteAs(
  member: Member,
  groupId: string,
  { days = 7, maxUses = null }: { days?: number; maxUses?: number | null } = {},
): Promise<{ token: string; inviteId: string }> {
  const token = randomBytes(20).toString("base64url");
  const { data, error } = await member.client.rpc("create_group_invite", {
    p_group: groupId,
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_code_hash: randomBytes(32).toString("hex"),
    p_expires_in_days: days,
    p_max_uses: maxUses,
  });
  if (error) throw error;
  return { token, inviteId: data as string };
}

/** Joins with a link token through the API (for setting up groups quickly). */
export async function joinAs(
  member: Member,
  token: string,
  shareLevel: "checkin_only" | "streak" | "full" = "full",
): Promise<void> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: details } = await member.client
    .rpc("group_invite_details", { p_token_hash: tokenHash })
    .maybeSingle<{ covenant_updated_at: string; min_share_level: string }>();
  const { error } = await member.client.rpc("join_group", {
    p_token_hash: tokenHash,
    p_code_hash: "",
    p_share_level: shareLevel,
    p_leaderboard_hidden: false,
    p_accept_covenant: true,
    p_covenant_seen: details?.covenant_updated_at,
  });
  if (error) throw error;
}
