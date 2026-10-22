import { renderNotificationEmail } from "@/emails/notification";
import { siteOrigin } from "@/lib/env";
import { sendEmail } from "@/lib/email/sender";
import { pushConfigured, sendPush, type PushTarget } from "@/lib/push/web-push";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { isNotificationType, type NotificationType } from "../constants";
import { buildDigestPush, buildPush, emailWords } from "../outbound";
import { notificationEmailLinks } from "./unsubscribe";

/**
 * The sender (CLAUDE.md §7.8, D-092). The database asks for it (pg_net)
 * when something is ready; it claims a batch, sends each push to every
 * device and each email, and records what happened. Words come from
 * outbound.ts (discreet by default, never a group's name or anyone's text).
 * Never logs addresses, endpoints or words.
 */

interface Claimed {
  delivery_id: string;
  channel: string;
  user_id: string;
  type: string | null;
  group_id: string | null;
  data: unknown;
  actor_name: string | null;
  discreet: boolean;
  sound: boolean;
  vibrate: boolean;
  bundle_count: number | null;
  email: string | null;
  devices: unknown;
  unread: number;
}

interface Result {
  id: string;
  status: "sent" | "retry" | "failed";
  reason?: string;
  gone?: string[];
  used?: string[];
}

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function devicesOf(v: unknown): PushTarget[] {
  return Array.isArray(v)
    ? v.flatMap((d) => {
        const r = record(d);
        return typeof r.endpoint === "string" && typeof r.p256dh === "string" && typeof r.auth === "string"
          ? [{ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }]
          : [];
      })
    : [];
}

async function deliverPush(row: Claimed): Promise<Result> {
  if (!pushConfigured()) return { id: row.delivery_id, status: "retry", reason: "push_not_configured" };
  const devices = devicesOf(row.devices);
  if (!devices.length) return { id: row.delivery_id, status: "failed", reason: "no_device" };
  const urgent = row.type === "partner_sos" || row.type === "security";
  const payload = JSON.stringify(
    row.bundle_count
      ? buildDigestPush({
          id: row.delivery_id,
          count: row.bundle_count,
          unread: row.unread,
          sound: row.sound,
          vibrate: row.vibrate,
        })
      : buildPush({
          id: row.delivery_id,
          type: row.type as NotificationType,
          groupId: row.group_id,
          data: record(row.data),
          discreet: row.discreet,
          actorName: row.actor_name,
          unread: row.unread,
          sound: row.sound,
          vibrate: row.vibrate,
        }),
  );
  const outcomes = await Promise.all(
    devices.map(
      async (d) => [d.endpoint, await sendPush(d, payload, { urgent, ttlSeconds: urgent ? 3_600 : 86_400 })] as const,
    ),
  );
  const gone = outcomes.filter(([, r]) => r === "gone").map(([e]) => e);
  const used = outcomes.filter(([, r]) => r === "sent").map(([e]) => e);
  if (used.length) return { id: row.delivery_id, status: "sent", gone, used };
  if (gone.length === devices.length) return { id: row.delivery_id, status: "failed", reason: "gone", gone };
  return { id: row.delivery_id, status: "retry", reason: "push_error", gone };
}

async function deliverEmail(row: Claimed): Promise<Result> {
  if (!row.email) return { id: row.delivery_id, status: "failed", reason: "no_address" };
  const origin = siteOrigin();
  const kind = row.bundle_count ? "digest" : (row.type ?? "");
  const words = row.bundle_count
    ? emailWords({ digest: row.bundle_count })
    : emailWords({
        type: row.type as NotificationType,
        groupId: row.group_id,
        data: record(row.data),
        discreet: row.discreet,
        actorName: row.actor_name,
      });
  const { oneClick, ...links } = notificationEmailLinks(origin, row.user_id, kind, words.url);
  const message = await renderNotificationEmail(words, links);
  await sendEmail({
    to: row.email,
    ...message,
    headers: {
      // RFC 8058: mail apps show "Unsubscribe" and POST to it in one click.
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return { id: row.delivery_id, status: "sent" };
}

/** One run: claim up to `limit`, send, record. Returns counts only. */
export async function runDelivery(
  limit = 100,
): Promise<{ claimed: number; sent: number; retry: number; failed: number }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("notify_claim", { p_limit: limit });
  if (error) throw new Error(`notify_claim: ${error.message}`);
  const rows = (data ?? []) as Claimed[];
  const results: Result[] = [];
  // A few at a time, so one slow push service doesn't hold the rest.
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    results.push(
      ...(await Promise.all(
        chunk.map(async (row): Promise<Result> => {
          if (!row.bundle_count && (!row.type || !isNotificationType(row.type))) {
            return { id: row.delivery_id, status: "failed", reason: "unknown_type" };
          }
          try {
            return row.channel === "push" ? await deliverPush(row) : await deliverEmail(row);
          } catch (e) {
            devLog("notifications", e);
            return { id: row.delivery_id, status: "retry", reason: "send_error" };
          }
        }),
      )),
    );
  }
  if (results.length) {
    const { error: finishError } = await admin.rpc("notify_finish", { p_results: results as never });
    if (finishError) throw new Error(`notify_finish: ${finishError.message}`);
  }
  return {
    claimed: rows.length,
    sent: results.filter((r) => r.status === "sent").length,
    retry: results.filter((r) => r.status === "retry").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}

/** The one-click unsubscribe, after the link was verified. */
export async function applyUnsubscribe(userId: string, kind: string): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient().rpc("notify_unsubscribe", { p_user: userId, p_type: kind });
  if (error) {
    devLog("notifications", error);
    return false;
  }
  return data === true;
}
