/**
 * notifications module — in-app, push and email notifications (CLAUDE.md
 * §7.8). Phase 7b: the pipeline, the bell, the notification centre and
 * settings; Phase 7c: push and email delivery.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/notifications"          server code and server components (this file)
 *   "@/features/notifications/ui-live"  the live bell (client)
 *   "@/features/notifications/ui-push"  this device's push switch and the iOS guide (client)
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
export { parseCursor, pushEndpointSchema, pushSubscriptionSchema } from "./schemas";
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
export { applyUnsubscribe, runDelivery } from "./server/deliver";
export { getPushDevices, removePushSubscription, savePushSubscription, type PushDevice } from "./server/push";
export { verifyUnsubscribe } from "./server/unsubscribe";
export { exportNotificationData } from "./server/export";

// Server components: no JavaScript reaches the browser for these.
export { NotificationCentre, NotificationNotice } from "./components/centre-views";
export { NotificationSettingsPanel, NotificationSettingsCard } from "./components/settings-views";
export { UnsubscribeView } from "./components/unsubscribe-view";
export { DevicesSection, PushExplainer } from "./components/device-views";
