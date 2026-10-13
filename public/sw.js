/*
 * Holy Auramaxing service worker (CLAUDE.md §13, D-092). Phase 7 gives it
 * one job: show push notifications and open the app when one is tapped.
 * Phase 10 adds caching, the offline page and the offline check-in queue.
 *
 * A push carries only what's shown (discreet by default) and where to go;
 * it never holds anyone's words. Nothing is cached here.
 */
"use strict";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const ICON = "/icons/icon-192.png";
const BADGE = "/icons/badge-96.png";

function safePath(url) {
  // Only paths inside the app, never another site.
  return typeof url === "string" && /^\/[a-z0-9/_?=&.-]*$/i.test(url) && !url.startsWith("//") ? url : "/alerts";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title.slice(0, 80) : "Holy Auramaxing";
  const body = typeof data.body === "string" ? data.body.slice(0, 200) : "";
  const tasks = [
    self.registration.showNotification(title, {
      body,
      icon: ICON,
      badge: BADGE,
      tag: typeof data.tag === "string" ? data.tag.slice(0, 64) : undefined,
      data: { url: safePath(data.url) },
      silent: data.silent === true,
      vibrate: Array.isArray(data.vibrate) ? data.vibrate.slice(0, 6) : undefined,
    }),
  ];
  // The app-icon badge (Badging API), where the system supports it.
  if (typeof data.badge === "number" && "setAppBadge" in self.navigator) {
    tasks.push(
      (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {}),
    );
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(path) : undefined));
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});

// The browser replaced the subscription (keys rotated, or it expired): save the new one.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription ? event.oldSubscription.options : null;
  if (!options) return;
  event.waitUntil(
    self.registration.pushManager.subscribe(options).then((subscription) =>
      fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      }),
    ),
  );
});
