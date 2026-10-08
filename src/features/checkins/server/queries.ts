import { cache } from "react";

import { decryptText } from "@/lib/security/encryption";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { TRIGGERS, type Outcome, type Trigger } from "../constants";
import type { DayRecord } from "../insights";

/**
 * Reads for the check-in pages. Everything runs as the signed-in person:
 * their own rows through RLS, other members only through the share-level
 * view (D-044). Nothing here is cached across people.
 */

export interface CheckinOverview {
  timezone: string;
  /** YYYY-MM-DD in the person's time zone. */
  today: string;
  /** Today, plus yesterday until 12:00 local time (today first). */
  openDates: string[];
  /** Answers already given for the open dates. */
  answered: Record<string, Outcome>;
  /** Live: 0 once a day has been missed (D-043). */
  currentStreak: number;
  checkinStreak: number;
  longestStreak: number;
  totalCleanDays: number;
  totalCheckins: number;
  /** How many separate clean streaks have been built (D-046). */
  cleanStreaks: number;
  lastCheckinDate: string | null;
  lastCleanDate: string | null;
}

interface OverviewJson {
  timezone: string;
  today: string;
  open_dates: string[];
  answered: Record<string, Outcome>;
  current_streak: number;
  checkin_streak: number;
  longest_streak: number;
  total_clean_days: number;
  total_checkins: number;
  clean_streaks: number;
  last_checkin_date: string | null;
  last_clean_date: string | null;
}

/** One database round trip per request, however many components ask. */
export const getCheckinOverview = cache(async (): Promise<CheckinOverview> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_checkin_overview");
  if (error || !data) throw new Error(`check-in overview: ${error?.message ?? "no data"}`);
  const o = data as unknown as OverviewJson;
  return {
    timezone: o.timezone,
    today: o.today,
    openDates: o.open_dates,
    answered: o.answered ?? {},
    currentStreak: o.current_streak,
    checkinStreak: o.checkin_streak,
    longestStreak: o.longest_streak,
    totalCleanDays: o.total_clean_days,
    totalCheckins: o.total_checkins,
    cleanStreaks: o.clean_streaks,
    lastCheckinDate: o.last_checkin_date,
    lastCleanDate: o.last_clean_date,
  };
});

/** The associated data for a note: the person and the day, so a note can't be moved (D-025). */
export function noteContext(userId: string, date: string): string {
  return `checkin-note:${userId}:${date}`;
}

export interface CheckinDetails {
  date: string;
  outcome: Outcome;
  mood: number | null;
  urge: number | null;
  triggers: Trigger[];
  /** Decrypted for its author only; null if there is none (or it can't be read). */
  note: string | null;
  editCount: number;
}

function asTriggers(values: string[] | null): Trigger[] {
  return (values ?? []).filter((v): v is Trigger => (TRIGGERS as readonly string[]).includes(v));
}

export function decryptNote(userId: string, date: string, stored: string | null): string | null {
  if (!stored) return null;
  try {
    return decryptText(stored, noteContext(userId, date));
  } catch (error) {
    // A wrong or rotated key: keep the page working and say nothing about the content.
    devLog("checkin-note", error);
    return null;
  }
}

/** The person's own check-in for one day, note decrypted. */
export async function getCheckinFor(userId: string, date: string): Promise<CheckinDetails | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("checkins")
    .select("local_date, outcome, mood, urge_level, triggers, note_encrypted, edit_count")
    .eq("user_id", userId)
    .eq("local_date", date)
    .maybeSingle();
  if (!data) return null;
  return {
    date: data.local_date,
    outcome: data.outcome as Outcome,
    mood: data.mood,
    urge: data.urge_level,
    triggers: asTriggers(data.triggers),
    note: decryptNote(userId, data.local_date, data.note_encrypted),
    editCount: data.edit_count,
  };
}

/** The person's own check-ins between two dates (inclusive), without notes. */
export async function getCheckinHistory(userId: string, from: string, to: string): Promise<DayRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("checkins")
    .select("local_date, outcome, mood, urge_level, triggers")
    .eq("user_id", userId)
    .gte("local_date", from)
    .lte("local_date", to)
    .order("local_date", { ascending: true })
    .limit(400);
  if (error) throw new Error(`check-in history: ${error.message}`);
  return (data ?? []).map((row) => ({
    date: row.local_date,
    outcome: row.outcome as Outcome,
    mood: row.mood,
    urge: row.urge_level,
    triggers: asTriggers(row.triggers),
  }));
}

export interface MemberToday {
  userId: string;
  name: string;
  handle: string | null;
  avatarPath: string | null;
  isMe: boolean;
  checkedInToday: boolean;
  /** Null unless they share at least their streak with this group. */
  currentStreak: number | null;
  /** Null unless they share everything with this group. */
  outcome: Outcome | null;
}

/**
 * Today in a group: each member's check-in status, at the level they share
 * with THIS group (D-044). Names and photos come from profile_cards, so
 * each person's own privacy settings apply.
 */
export async function getGroupToday(groupId: string, userId: string): Promise<MemberToday[]> {
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("group_checkins_today")
    .select("user_id, checked_in_today, current_streak, outcome")
    .eq("group_id", groupId);
  const members = (rows ?? []).filter((r): r is typeof r & { user_id: string } => Boolean(r.user_id));
  if (!members.length) return [];
  const { data: cards } = await supabase
    .from("profile_cards")
    .select("id, handle, display_name, avatar_path")
    .in(
      "id",
      members.map((m) => m.user_id),
    );
  const byId = new Map((cards ?? []).map((c) => [c.id, c]));
  return members
    .map((m) => {
      const card = byId.get(m.user_id);
      return {
        userId: m.user_id,
        name: card?.display_name || card?.handle || "",
        handle: card?.handle ?? null,
        avatarPath: card?.avatar_path ?? null,
        isMe: m.user_id === userId,
        checkedInToday: Boolean(m.checked_in_today),
        currentStreak: m.current_streak,
        outcome: (m.outcome as Outcome | null) ?? null,
      };
    })
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
}
