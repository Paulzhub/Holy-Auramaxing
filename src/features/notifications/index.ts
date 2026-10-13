/**
 * notifications module — in-app, push and email notifications (CLAUDE.md
 * §7.8). Phase 7b: the pipeline, the bell, the notification centre and
 * settings; Phase 7c: push and email delivery.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/notifications"          server code and server components (this file)
 *   "@/features/notifications/ui-live"  the live bell (client)
 */
export {
  DIGEST_MODES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SECTIONS,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LIST,
  isNotificationType,
} from "./constants";
export type { DigestMode, NotificationChannel, NotificationSection, NotificationType } from "./constants";
export { notificationHref } from "./links";
export { parseCursor } from "./schemas";
export {
  getAlertsTopic,
  getNotificationSettings,
  getNotifications,
  getUnreadCounts,
  type NotificationItem,
  type NotificationPage,
  type NotificationSettings,
  type UnreadCounts,
} from "./server/queries";
export { openNotification } from "./server/open";
export { exportNotificationData } from "./server/export";

// Server components: no JavaScript reaches the browser for these.
export { NotificationCentre, NotificationNotice } from "./components/centre-views";
export { NotificationSettingsPanel, NotificationSettingsCard } from "./components/settings-views";
