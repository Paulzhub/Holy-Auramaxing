import { headers } from "next/headers";

import { describeUserAgent } from "@/lib/security/request-info";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * This browser's push subscription, saved or removed as the signed-in person
 * (D-092). The label is coarse ("Chrome on Android"), for the settings page.
 */
export async function savePushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const label = describeUserAgent((await headers()).get("user-agent"));
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: input.endpoint,
    p_p256dh: input.keys.p256dh,
    p_auth: input.keys.auth,
    p_label: label,
  });
  if (error) devLog("notifications", error);
  return !error;
}

export async function removePushSubscription(endpoint: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
  if (error) devLog("notifications", error);
  return !error;
}

export interface PushDevice {
  id: string;
  label: string | null;
  addedAt: string;
  lastUsedAt: string | null;
}

export async function getPushDevices(): Promise<PushDevice[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, user_agent, created_at, last_used_at")
    .order("created_at", { ascending: false });
  return (data ?? []).map((d) => ({
    id: d.id,
    label: d.user_agent,
    addedAt: d.created_at,
    lastUsedAt: d.last_used_at,
  }));
}
