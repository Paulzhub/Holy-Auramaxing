import { createTranslator } from "next-intl";

import type { EmailWords } from "@/emails/notification";

import en from "../../../messages/en.json";
import { NOTIFICATION_TYPES, type NotificationType } from "./constants";
import { notificationHref } from "./links";

/**
 * What leaves the app: the words of a push notification and of a
 * notification email (CLAUDE.md §2.3, §7.8; D-092). Pure, so
 * src/test/discretion.test.ts can render every type in both modes.
 *
 *  - Discreet mode (on by default): never who or what, only that there's
 *    something new, in a few neutral lines ("You have a new message from
 *    your group").
 *  - Discreet mode off: the other person's name and a neutral action
 *    ("Sam sent you encouragement"), owner 2026-10-13.
 *  - Never, in either: a group's name, anyone's words, a badge or level
 *    name, a streak or count of days. Email subjects are always neutral.
 */

export interface OutboundInput {
  type: NotificationType;
  data: Record<string, unknown>;
  discreet: boolean;
  actorName: string | null;
  groupId: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** A path inside the app (the notification's page). */
  url: string;
  /** Replaces an earlier notification with the same tag on the device. */
  tag: string;
  badge?: number;
  silent?: boolean;
  vibrate?: number[];
}

const t = createTranslator({ locale: "en", messages: en, namespace: "notifications" });

const DISCREET_LINE: Record<NotificationType, keyof typeof en.notifications.push.discreet> = {
  daily_reminder: "daily_reminder",
  streak_at_risk: "streak_at_risk",
  weekly_recap: "weekly_recap",
  nudge: "people",
  reaction: "people",
  comment: "people",
  prayed_for_you: "people",
  partner_request: "people",
  prayer_request: "group",
  announcement: "group",
  milestone: "group",
  challenge: "group",
  covenant: "group",
  partner_missed: "partner_missed",
  partner_sos: "partner_sos",
  level_up: "progress",
  badge_earned: "progress",
  join_request: "leading",
  member_joined: "leading",
  report: "leading",
  security: "security_new_login",
};

const target = (v: unknown) => (v === "comment" || v === "checkin" ? v : "post");

/** The one line that says what happened, as discreetly as the person chose. */
export function outboundLine({ type, data, discreet, actorName }: OutboundInput): string {
  if (type === "security") {
    return t(
      data.what === "password_changed" ? "push.discreet.security_password_changed" : "push.discreet.security_new_login",
    );
  }
  const actor = actorName?.trim() || null;
  // Without a name to give, or by choice, the discreet line.
  const named = !discreet && (actor || !NAMED_NEEDS_ACTOR.has(type));
  if (!named) return t(`push.discreet.${DISCREET_LINE[type]}`);
  const a = actor ?? t("someone");
  switch (type) {
    case "reaction":
      return t("push.named.reaction", { actor: a, target: target(data.target) });
    case "comment":
      return t(data.reply === true ? "push.named.reply" : "push.named.comment", { actor: a });
    case "challenge":
      return t(data.phase === "end" ? "push.named.challenge_end" : "push.named.challenge_start");
    case "partner_request":
      return t(
        data.what === "accepted"
          ? "push.named.partner_accepted"
          : data.what === "ended"
            ? "push.named.partner_ended"
            : "push.named.partner_requested",
        { actor: a },
      );
    case "daily_reminder":
    case "streak_at_risk":
    case "weekly_recap":
      return t(`push.discreet.${type}`);
    case "level_up":
    case "badge_earned":
    case "report":
      return t(`push.named.${type}`);
    default:
      return t(`push.named.${type}`, { actor: a });
  }
}

/** Types whose named line needs the other person's name. */
const NAMED_NEEDS_ACTOR = new Set<NotificationType>([
  "nudge",
  "reaction",
  "comment",
  "prayed_for_you",
  "prayer_request",
  "announcement",
  "milestone",
  "covenant",
  "partner_request",
  "partner_missed",
  "partner_sos",
  "join_request",
  "member_joined",
]);

export function buildPush(
  input: OutboundInput & { id: string; unread?: number; sound?: boolean; vibrate?: boolean },
): PushPayload {
  return {
    title: t("push.title"),
    body: outboundLine(input),
    url: notificationHref({ type: input.type, groupId: input.groupId, data: input.data }),
    tag: input.id,
    badge: input.unread,
    silent: input.sound === false,
    vibrate: input.vibrate === false ? [] : [80, 40, 80],
  };
}

export function buildDigestPush(input: {
  id: string;
  count: number;
  unread?: number;
  sound?: boolean;
  vibrate?: boolean;
}): PushPayload {
  return {
    title: t("push.title"),
    body: t("push.discreet.digest", { count: input.count }),
    url: "/alerts",
    tag: "digest",
    badge: input.unread,
    silent: input.sound === false,
    vibrate: input.vibrate === false ? [] : [80, 40, 80],
  };
}

export function emailWords(input: OutboundInput | { digest: number }): EmailWords {
  const shared = {
    preview: t("email.preview"),
    heading: t("email.heading"),
    open: t("email.open"),
    unsubscribe: t("email.unsubscribe"),
    settings: t("email.settings"),
  };
  if ("digest" in input) {
    return {
      ...shared,
      subject: t("email.subjectDigest", { count: input.digest }),
      line: t("push.discreet.digest", { count: input.digest }),
      why: t("email.whyDigest"),
      url: "/alerts",
    };
  }
  return {
    ...shared,
    subject: input.type === "security" ? t("email.subjectSecurity") : t("email.subject"),
    line: outboundLine(input),
    why: t("email.why", { type: t(`settings.types.${input.type}`) }),
    url: notificationHref({ type: input.type, groupId: input.groupId, data: input.data }),
  };
}

/** Every type, for tests. */
export const OUTBOUND_TYPES = Object.keys(NOTIFICATION_TYPES) as NotificationType[];
