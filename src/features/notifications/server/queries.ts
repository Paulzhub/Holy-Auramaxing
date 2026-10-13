import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  DIGEST_MODES,
  NOTIFICATIONS_PAGE,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LIST,
  isLockedType,
  isNotificationType,
  type DigestMode,
  type NotificationType,
} from "../constants";

/**
 * Reading my notifications and settings (CLAUDE.md §7.8, D-089). Everything
 * goes through the database's own functions and RLS; names come from
 * profile_cards, so each person's privacy settings and blocks apply.
 */

export interface UnreadCounts {
  total: number;
  /** Unread per group id (notifications about a group). */
  byGroup: Record<string, number>;
}

export async function getUnreadCounts(): Promise<UnreadCounts> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_unread_counts");
  if (error) return { total: 0, byGroup: {} };
  const byGroup: Record<string, number> = {};
  let total = 0;
  for (const row of data ?? []) {
    total += row.unread;
    if (row.group_id) byGroup[row.group_id] = row.unread;
  }
  return { total, byGroup };
}

/** Today's name of my own live channel (D-086's pattern, per person), or null. */
export async function getAlertsTopic(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_live_topic");
  return error ? null : (data ?? null);
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  groupId: string | null;
  groupName: string | null;
  actorName: string | null;
  data: Record<string, unknown>;
  count: number;
  read: boolean;
  createdAt: string;
}

export interface NotificationCursor {
  at: string;
  id: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  next: NotificationCursor | null;
}

export async function getNotifications(before: NotificationCursor | null): Promise<NotificationPage> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_notifications", {
    p_before_at: before?.at as string,
    p_before_id: before?.id as string,
    p_limit: NOTIFICATIONS_PAGE + 1,
  });
  if (error) throw new Error(`notifications: ${error.message}`);
  const rows = (data ?? []).filter((r) => isNotificationType(r.type));
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))];
  const { data: cards } = actorIds.length
    ? await supabase.from("profile_cards").select("id, handle, display_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((cards ?? []).map((c) => [c.id, c.display_name || c.handle || null]));
  const page = rows.slice(0, NOTIFICATIONS_PAGE);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      type: r.type as NotificationType,
      groupId: r.group_id,
      groupName: r.group_name,
      actorName: r.actor_id ? (names.get(r.actor_id) ?? null) : null,
      data: (r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown>,
      count: r.fold_count,
      read: Boolean(r.read_at),
      createdAt: r.created_at,
    })),
    next: rows.length > NOTIFICATIONS_PAGE && last ? { at: last.created_at, id: last.id } : null,
  };
}

export interface ChannelChoice {
  type: NotificationType;
  push: boolean;
  email: boolean;
  locked: boolean;
}

export interface NotificationSettings {
  channels: ChannelChoice[];
  reminderTime: string | null;
  quietStart: string;
  quietEnd: string;
  digest: DigestMode;
  discreet: boolean;
  sound: boolean;
  vibrate: boolean;
  snoozeUntil: string | null;
  groups: { id: string; name: string; muted: boolean }[];
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const supabase = await createSupabaseServerClient();
  const [prefs, settings, memberships] = await Promise.all([
    supabase.from("notification_preferences").select("type, channel, enabled").eq("user_id", userId),
    supabase
      .from("notification_settings")
      .select("reminder_time, quiet_hours_start, quiet_hours_end, digest, discreet_mode, sound, vibrate, snooze_until")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("group_members").select("group_id, notifications_muted").eq("user_id", userId).eq("status", "active"),
  ]);
  const chosen = new Map((prefs.data ?? []).map((p) => [`${p.type}:${p.channel}`, p.enabled]));
  const groupIds = (memberships.data ?? []).map((m) => m.group_id);
  const { data: groups } = groupIds.length
    ? await supabase.from("groups").select("id, name, archived_at").in("id", groupIds).order("name")
    : { data: [] };
  const muted = new Map((memberships.data ?? []).map((m) => [m.group_id, m.notifications_muted]));
  const s = settings.data;
  const now = Date.now();
  return {
    channels: NOTIFICATION_TYPE_LIST.map((type) => {
      const info = NOTIFICATION_TYPES[type];
      const locked = isLockedType(type);
      return {
        type,
        push: locked ? true : (chosen.get(`${type}:push`) ?? info.push),
        email: locked ? true : (chosen.get(`${type}:email`) ?? info.email),
        locked,
      };
    }),
    reminderTime: hhmm(s?.reminder_time),
    quietStart: hhmm(s?.quiet_hours_start) ?? "22:00",
    quietEnd: hhmm(s?.quiet_hours_end) ?? "07:00",
    digest: (DIGEST_MODES as readonly string[]).includes(s?.digest ?? "") ? (s!.digest as DigestMode) : "off",
    discreet: s?.discreet_mode ?? true,
    sound: s?.sound ?? true,
    vibrate: s?.vibrate ?? true,
    snoozeUntil: s?.snooze_until && Date.parse(s.snooze_until) > now ? s.snooze_until : null,
    groups: (groups ?? [])
      .filter((g) => !g.archived_at)
      .map((g) => ({ id: g.id, name: g.name, muted: muted.get(g.id) ?? false })),
  };
}
