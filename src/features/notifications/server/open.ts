import { createSupabaseServerClient } from "@/lib/supabase/server";

import { isNotificationType } from "../constants";
import { notificationHref } from "../links";
import { uuidSchema } from "../schemas";

/**
 * Opening a notification from Alerts: mark it read, then go where it leads
 * (D-089). Only my own row can be read (RLS), so another person's id simply
 * goes back to Alerts. Returns a path inside the app.
 */
export async function openNotification(id: string): Promise<string> {
  if (!uuidSchema.safeParse(id).success) return "/alerts";
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, group_id, data, read_at")
    .eq("id", id)
    .maybeSingle();
  if (!data || !isNotificationType(data.type)) return "/alerts";
  if (!data.read_at) await supabase.rpc("mark_notifications_read", { p_ids: [data.id] });
  const record = data.data && typeof data.data === "object" && !Array.isArray(data.data) ? data.data : {};
  return notificationHref({ type: data.type, groupId: data.group_id, data: record as Record<string, unknown> });
}
