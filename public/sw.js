/*
 * Holy Auramaxing service worker (CLAUDE.md §13, D-092). Phase 7 gave it
 * push: show a notification and open the app when one is tapped. Phase 8a
 * (D-106) adds one small, versioned cache: the /breathe page and the files it
 * needs, shown whenever a page can't load because the device is offline.
 * Phase 10 extends this cache into the full app shell and offline queue.
 *
 * A push carries only what's shown (discreet by default) and where to go;
 * it never holds anyone's words. The cache holds only /breathe, a page with
 * nobody's data on it; nothing personal is ever cached.
 */
"use strict";

// ---------------------------------------------------------------- offline page

const OFFLINE_CACHE = "ha-offline-v1";
const OFFLINE_PAGE = "/breathe";
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/** The page, plus the scripts, styles and fonts it names (same origin, under /_next/static/ only). */
async function cacheOfflinePage() {
  const cache = await caches.open(OFFLINE_CACHE);
  const response = await fetch(OFFLINE_PAGE, { credentials: "omit", cache: "no-store" });
  if (!response.ok) return;
  const html = await response.clone().text();
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)"/gi)) assets.add(match[1]);
  await Promise.all(
    [...assets].map((url) =>
      fetch(url)
        .then((r) => (r.ok ? cache.put(url, r) : undefined))
        .catch(() => undefined),
    ),
  );
  const headers = new Headers(response.headers);
  headers.set("x-cached-at", String(Date.now()));
  await cache.put(OFFLINE_PAGE, new Response(await response.blob(), { status: 200, headers }));
}

/** Refresh the copy now and then (a new deploy has new file names). Never fails the caller. */
async function refreshOfflinePage(force) {
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const cached = await cache.match(OFFLINE_PAGE);
    const at = Number(cached && cached.headers.get("x-cached-at"));
    if (force || !cached || !at || Date.now() - at > REFRESH_AFTER_MS) await cacheOfflinePage();
  } catch {
    // Offline or the server is down: keep the old copy.
  }
}

self.addEventListener("install", (event) => {
  // Best effort: push must keep working even if the page can't be fetched now.
  event.waitUntil(refreshOfflinePage(true).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("ha-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// The app asks for a refresh when it opens (at most once a day it actually fetches).
self.addEventListener("message", (event) => {
  // Only the app's own pages may ask (they're the only clients this worker has).
  const from = event.source && "url" in event.source ? new URL(event.source.url).origin : event.origin;
  if (from !== self.location.origin) return;
  if (event.data === "refresh-offline") event.waitUntil(refreshOfflinePage(false));
});

// Page loads go to the network as usual; only when one fails (offline, or
// the server can't be reached) does the worker answer, with /breathe. The
// static files /breathe needs come from its own small cache when present
// (their names change with every deploy, so a cached one is never stale).
// Everything else isn't touched. (A device's "offline" flag isn't reliable
// enough to decide this, so it isn't used.) Phase 10 adds caching for the rest.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_PAGE, { cacheName: OFFLINE_CACHE }).then((r) => r || Response.error()),
      ),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(url.pathname, { cacheName: OFFLINE_CACHE }).then((r) => r || fetch(request)));
  }
});

// ---------------------------------------------------------------- push

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
