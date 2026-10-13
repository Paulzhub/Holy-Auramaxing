import type { ExportPart, ExportRow } from "@/lib/data-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The notifications module's part of "Download my data" (D-032, D-089): my
 * notifications (types, ids and codes, never anyone's text), my channel
 * choices, muted groups and push devices (labels only; no endpoints or keys).
 */
export async function exportNotificationData(): Promise<ExportPart> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_notifications_export");
  if (error) throw new Error(`notifications export: ${error.message}`);
  const all = (data ?? {}) as Record<string, unknown>;
  const list = (key: string): Record<string, unknown>[] =>
    Array.isArray(all[key]) ? (all[key] as Record<string, unknown>[]) : [];
  const flat = (row: Record<string, unknown>): ExportRow =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        v === null || ["string", "number", "boolean"].includes(typeof v) ? (v as ExportRow[string]) : JSON.stringify(v),
      ]),
    );
  return {
    sections: [
      {
        name: "notifications",
        description: "Your notifications from the last 90 days: what kind, which group, and when you read them.",
        rows: list("notifications").map(flat),
      },
      {
        name: "notification_choices",
        description: "Where you changed what reaches you by push or email.",
        rows: list("preferences").map(flat),
      },
      {
        name: "notification_muted_groups",
        description: "The groups whose push and email you muted (group ids).",
        rows: (Array.isArray(all.muted_groups) ? (all.muted_groups as unknown[]) : []).map((g) => ({
          group_id: typeof g === "string" ? g : null,
        })),
      },
      {
        name: "push_devices",
        description: "The devices you allowed to show notifications (a short description only).",
        rows: list("devices").map(flat),
      },
    ],
    files: [],
  };
}
