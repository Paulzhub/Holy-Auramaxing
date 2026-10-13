import type { NotificationType } from "./constants";

/**
 * Where a notification leads (D-089). Pure, so Vitest can check every type
 * has a page. Ids come from the database; anything that isn't a UUID falls
 * back to the group (or Alerts), so a row can't send anyone elsewhere.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LinkableNotification {
  type: NotificationType;
  groupId: string | null;
  data: Record<string, unknown>;
}

const id = (value: unknown): string | null => (typeof value === "string" && UUID.test(value) ? value : null);

export function notificationHref({ type, groupId, data }: LinkableNotification): string {
  const group = id(groupId);
  const inGroup = (path = "") => (group ? `/groups/${group}${path}` : "/alerts");
  const post = id(data.post);
  switch (type) {
    case "daily_reminder":
    case "streak_at_risk":
      return "/check-in";
    case "weekly_recap":
    case "level_up":
    case "badge_earned":
      return "/progress";
    case "security":
      return "/settings/security";
    case "reaction":
      return post ? inGroup(`/wall/${post}`) : inGroup();
    case "comment":
    case "prayed_for_you":
    case "prayer_request":
    case "announcement":
    case "milestone":
      return post ? inGroup(`/wall/${post}`) : inGroup("/wall");
    case "partner_request":
    case "partner_missed":
    case "partner_sos":
      return inGroup("/partner");
    case "join_request":
    case "member_joined":
      return inGroup("/members");
    case "report":
      return inGroup("/moderation");
    case "nudge":
    case "challenge":
    case "covenant":
      return inGroup();
  }
}
