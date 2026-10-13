/**
 * The notification catalogue (CLAUDE.md §7.8, D-089). It mirrors
 * public.notification_types; notifications.test.ts checks the two agree.
 */

export const NOTIFICATION_SECTIONS = [
  "daily",
  "people",
  "group",
  "partner",
  "progress",
  "leading",
  "security",
] as const;
export type NotificationSection = (typeof NOTIFICATION_SECTIONS)[number];

export const NOTIFICATION_CHANNELS = ["push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationTypeInfo {
  section: NotificationSection;
  push: boolean;
  email: boolean;
  /** Skips snooze, quiet hours, digest and group mutes. */
  urgent?: boolean;
  /** Can't be turned off. */
  locked?: boolean;
}

/** In settings order. Defaults: in-app always; push and email as below. */
export const NOTIFICATION_TYPES = {
  daily_reminder: { section: "daily", push: true, email: false },
  streak_at_risk: { section: "daily", push: true, email: false },
  weekly_recap: { section: "daily", push: false, email: false },
  nudge: { section: "people", push: true, email: false },
  reaction: { section: "people", push: false, email: false },
  comment: { section: "people", push: true, email: false },
  prayed_for_you: { section: "people", push: true, email: false },
  prayer_request: { section: "group", push: false, email: false },
  announcement: { section: "group", push: true, email: false },
  milestone: { section: "group", push: false, email: false },
  challenge: { section: "group", push: true, email: false },
  covenant: { section: "group", push: true, email: false },
  partner_request: { section: "partner", push: true, email: false },
  partner_missed: { section: "partner", push: true, email: false },
  partner_sos: { section: "partner", push: true, email: false, urgent: true },
  level_up: { section: "progress", push: false, email: false },
  badge_earned: { section: "progress", push: false, email: false },
  join_request: { section: "leading", push: true, email: false },
  member_joined: { section: "leading", push: false, email: false },
  report: { section: "leading", push: true, email: false },
  security: { section: "security", push: true, email: true, urgent: true, locked: true },
} as const satisfies Record<string, NotificationTypeInfo>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export const NOTIFICATION_TYPE_LIST = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

export function isNotificationType(value: string): value is NotificationType {
  return Object.hasOwn(NOTIFICATION_TYPES, value);
}

/** Can't be turned off (security alerts). */
export function isLockedType(type: NotificationType): boolean {
  const info: NotificationTypeInfo = NOTIFICATION_TYPES[type];
  return Boolean(info.locked);
}

export const DIGEST_MODES = ["off", "daily", "weekly"] as const;
export type DigestMode = (typeof DIGEST_MODES)[number];

export const SNOOZE_CHOICES = ["day", "week", "off"] as const;
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number];

/** Notifications shown per page in the notification centre. */
export const NOTIFICATIONS_PAGE = 30;
