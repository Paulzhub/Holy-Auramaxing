import type { getTranslations } from "next-intl/server";

import type { NotificationItem } from "./server/queries";

/**
 * The words for one notification in the app (D-089). Pure, so Vitest can
 * check every type has words; never used for push or email, which have their
 * own discreet copy (Phase 7c).
 */

type T = Awaited<ReturnType<typeof getTranslations<"notifications">>>;
type TAll = Awaited<ReturnType<typeof getTranslations>>;

const code = (v: unknown): string => (typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v) ? v : "");

/** The words for one notification, in the app (never sent anywhere). */
export function notificationText(item: NotificationItem, t: T, tAll: TAll): string {
  const actor = item.actorName ?? t("someone");
  const others = Math.max(0, item.count - 1);
  const d = item.data;
  switch (item.type) {
    case "nudge": {
      const kind = code(d.kind);
      return t("items.nudge", { actor, kind: kind ? tAll(`social.nudges.kinds.${kind}` as never) : "" });
    }
    case "reaction":
      return t("items.reaction", { actor, others, target: code(d.target) || "post" });
    case "comment":
      return d.reply === true ? t("items.reply", { actor, others }) : t("items.comment", { actor, others });
    case "prayed_for_you":
      return t("items.prayed_for_you", { actor, others });
    case "prayer_request":
    case "announcement":
      return t(`items.${item.type}`, { actor });
    case "milestone":
    case "badge_earned": {
      const badge = code(d.badge);
      const name = badge ? tAll(`badges.items.${badge}.name` as never) : "";
      return item.type === "milestone"
        ? t("items.milestone", { actor, badge: name })
        : t("items.badge_earned", { badge: name });
    }
    case "challenge":
      return d.phase === "end" ? t("items.challenge_end") : t("items.challenge_start");
    case "covenant":
      return t("items.covenant", { actor });
    case "partner_request":
      return d.what === "accepted"
        ? t("items.partner_accepted", { actor })
        : d.what === "ended"
          ? t("items.partner_ended", { actor })
          : t("items.partner_requested", { actor });
    case "partner_missed":
    case "partner_sos":
    case "member_joined":
      return t(`items.${item.type}`, { actor });
    case "join_request":
      return t("items.join_request", { actor, others });
    case "report":
      return t("items.report", { count: item.count });
    case "level_up":
      return t("items.level_up", { level: typeof d.level === "number" ? d.level : 0 });
    case "security":
      return d.what === "password_changed" ? t("items.security_password_changed") : t("items.security_new_login");
    case "daily_reminder":
    case "streak_at_risk":
    case "weekly_recap":
      return t(`items.${item.type}`);
  }
}
