/*
 * Holy Auramaxing service worker (CLAUDE.md §13; D-092, D-106, D-124 to D-127).
 *
 * - Push: show a notification, open the app when one is tapped, set the
 *   app-icon badge, re-save a replaced subscription (Phase 7, D-092).
 * - Offline pages: /offline (check in without a connection) and /breathe
 *   (the SOS tools) are kept for this version and shown whenever a page
 *   can't load. Both have nobody's data on them, and are fetched without
 *   cookies.
 * - Static files: the app's hashed scripts, styles and fonts are kept as
 *   they're used (their names change with every deploy, so a kept one is
 *   never stale). The landing page's 3D story is never kept (D-121): it
 *   loads only when a visitor shows intent, and keeping it would defeat that.
 * - Never kept: any page's HTML (signed-in pages are personal, and every page
 *   carries its own CSP nonce), /api/*, server actions, pictures, Supabase.
 * - The offline check-in queue (sw-queue.js) is sent by Background Sync
 *   where the browser has it, or when an open page asks.
 * - Updates: a new deploy is a new worker (registered as /sw.js?v=<version>).
 *   It waits until the person taps "Refresh" in the app (D-125), so nobody
 *   is switched to new code in the middle of something.
 */
"use strict";

var VERSION = (function () {
  var v = new URL(self.location.href).searchParams.get("v") || "dev";
  return /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : "dev";
})();

importScripts("/sw-queue.js?v=" + VERSION);

var SHELL_CACHE = "ha-shell-" + VERSION;
var STATIC_CACHE = "ha-static-v1";
var ICON_CACHE = "ha-icons-v1";
var OFFLINE_PAGE = "/offline";
var BREATHE_PAGE = "/breathe";
var SHELL_PAGES = [OFFLINE_PAGE, BREATHE_PAGE];
var STATIC_LIMIT = 150;
var SYNC_TAG = "ha-checkins";
var MSG = {
  flush: "ha-flush",
  skipWaiting: "ha-skip-waiting",
  forget: "ha-forget",
  refreshOffline: "refresh-offline",
  synced: "ha-synced",
};
// The landing page's 3D story (D-121): never kept. The same markers story.spec.ts uses.
var STORY_MARKERS = ["THREE.WebGLRenderer", "ScrollTrigger", "lenis-smooth"];

function isStory(text) {
  for (var i = 0; i < STORY_MARKERS.length; i++) if (text.indexOf(STORY_MARKERS[i]) !== -1) return true;
  return false;
}

// ---------------------------------------------------------------- the offline pages

/** Static files a page or stylesheet names (same origin, under /_next/static/ only). */
function staticRefs(text) {
  var found = [];
  var re = /(?:src|href)="(\/_next\/static\/[^"?#]+)"|url\((?:"|')?(\/_next\/static\/[^)"'?#]+)/gi;
  var m;
  while ((m = re.exec(text))) found.push(m[1] || m[2]);
  return found;
}

async function cacheShell() {
  var cache = await caches.open(SHELL_CACHE);
  var assets = new Set();
  for (var i = 0; i < SHELL_PAGES.length; i++) {
    var page = SHELL_PAGES[i];
    var response = await fetch(page, { credentials: "omit", cache: "no-store" });
    if (!response.ok) throw new Error("shell " + page + " " + response.status);
    var html = await response.clone().text();
    staticRefs(html).forEach(function (u) {
      assets.add(u);
    });
    await cache.put(page, response);
  }
  // Stylesheets name their fonts.
  var list = Array.from(assets);
  await Promise.all(
    list.map(async function (url) {
      var r = await fetch(url);
      if (!r.ok) return;
      if (/\.css$/.test(url)) {
        staticRefs(await r.clone().text()).forEach(function (u) {
          assets.add(u);
        });
      }
      await cache.put(url, r);
    }),
  );
  await Promise.all(
    Array.from(assets)
      .filter(function (u) {
        return list.indexOf(u) === -1;
      })
      .map(function (url) {
        return fetch(url)
          .then(function (r) {
            return r.ok ? cache.put(url, r) : undefined;
          })
          .catch(function () {});
      }),
  );
}

async function hasShell() {
  var cache = await caches.open(SHELL_CACHE);
  return Boolean(await cache.match(OFFLINE_PAGE));
}

async function ensureShell() {
  try {
    if (!(await hasShell())) await cacheShell();
  } catch {
    // Offline or the server is down: the last version's pages still answer (see offlineResponse).
  }
}

/** This version's offline page, or any earlier version's while this one has none yet. */
async function offlineResponse(pathname) {
  var page = pathname === BREATHE_PAGE ? BREATHE_PAGE : OFFLINE_PAGE;
  var own = await caches.match(page, { cacheName: SHELL_CACHE });
  if (own) return own;
  var any = await caches.match(page);
  if (any) return any;
  return (await caches.match(OFFLINE_PAGE)) || (await caches.match(BREATHE_PAGE)) || Response.error();
}

// ---------------------------------------------------------------- lifecycle

self.addEventListener("install", function (event) {
  event.waitUntil(
    ensureShell().then(function () {
      // The very first worker takes over at once; later ones wait for "Refresh" (D-125).
      if (!self.registration.active) return self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", function (event) {
  var keep = [SHELL_CACHE, STATIC_CACHE, ICON_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf("ha-") === 0 && keep.indexOf(k) === -1;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

async function forgetEverything() {
  var keys = await caches.keys();
  await Promise.all(
    keys
      .filter(function (k) {
        return k.indexOf("ha-") === 0;
      })
      .map(function (k) {
        return caches.delete(k);
      }),
  );
  await new Promise(function (resolve) {
    var request = indexedDB.deleteDatabase(self.haQueue.DB_NAME);
    request.onsuccess =
      request.onerror =
      request.onblocked =
        function () {
          resolve();
        };
  });
  // The offline pages hold nobody's data: keep SOS working offline for whoever comes next.
  await ensureShell();
}

async function flushAndTell() {
  var result = await self.haQueue.flush();
  if (result.sent.length || result.dropped) {
    var windows = await self.clients.matchAll({ type: "window" });
    windows.forEach(function (client) {
      client.postMessage({ type: MSG.synced, sent: result.sent, dropped: result.dropped, waiting: result.waiting });
    });
  }
  return result;
}

self.addEventListener("message", function (event) {
  // Only the app's own pages may ask (they're the only clients this worker has).
  var from = event.source && "url" in event.source ? new URL(event.source.url).origin : event.origin;
  if (from !== self.location.origin) return;
  var data = event.data;
  if (data === MSG.skipWaiting) self.skipWaiting();
  else if (data === MSG.flush) event.waitUntil(flushAndTell());
  else if (data === MSG.forget) event.waitUntil(forgetEverything());
  else if (data === MSG.refreshOffline) event.waitUntil(ensureShell());
});

// Background Sync (Chrome and Android): the browser wakes the worker when the connection is back.
self.addEventListener("sync", function (event) {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    flushAndTell().then(function (result) {
      // Still waiting for the connection: ask the browser to try again later.
      if (result.waiting && !result.sent.length) throw new Error("retry");
    }),
  );
});

// ---------------------------------------------------------------- fetch

function saveData(request) {
  return request.headers.get("save-data") === "on";
}

async function trim(cache) {
  var keys = await cache.keys();
  for (var i = 0; i < keys.length - STATIC_LIMIT; i++) await cache.delete(keys[i]);
}

/** Hashed static files: kept as they're used, except the 3D story. */
async function staticFile(request, pathname) {
  var cached =
    (await caches.match(pathname, { cacheName: SHELL_CACHE })) ||
    (await caches.match(pathname, { cacheName: STATIC_CACHE }));
  if (cached) return cached;
  var response = await fetch(request);
  if (!response.ok || response.type !== "basic" || saveData(request)) return response;
  try {
    if (/\.js$/.test(pathname) && isStory(await response.clone().text())) return response;
    var cache = await caches.open(STATIC_CACHE);
    await cache.put(pathname, response.clone());
    await trim(cache);
  } catch {
    // Storage full or refused: the file still reaches the page.
  }
  return response;
}

/** Icons and the manifest: answer from the copy, refresh it behind the scenes. */
async function iconFile(event, request) {
  var cache = await caches.open(ICON_CACHE);
  var cached = await cache.match(request);
  var refresh = fetch(request)
    .then(function (r) {
      if (r.ok)
        return cache.put(request, r.clone()).then(function () {
          return r;
        });
      return r;
    })
    .catch(function () {
      return undefined;
    });
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always from the network; only when that fails, an offline page.
  // (A device's "offline" flag isn't reliable enough to decide this, so it isn't used.)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () {
        return offlineResponse(url.pathname.replace(/^\/en(?=\/|$)/, "") || "/");
      }),
    );
    return;
  }
  if (url.pathname.indexOf("/_next/static/") === 0) {
    event.respondWith(staticFile(request, url.pathname));
    return;
  }
  if (url.pathname.indexOf("/icons/") === 0 || url.pathname === "/manifest.webmanifest") {
    event.respondWith(iconFile(event, request));
  }
  // Everything else (data, /api/*, pictures) isn't touched.
});

// ---------------------------------------------------------------- push

var ICON = "/icons/icon-192.png";
var BADGE = "/icons/badge-96.png";

function safePath(url) {
  // Only paths inside the app, never another site.
  return typeof url === "string" && /^\/[a-z0-9/_?=&.-]*$/i.test(url) && url.indexOf("//") !== 0 ? url : "/alerts";
}

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  var title = typeof data.title === "string" ? data.title.slice(0, 80) : "Holy Auramaxing";
  var body = typeof data.body === "string" ? data.body.slice(0, 200) : "";
  var tasks = [
    self.registration.showNotification(title, {
      body: body,
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
      (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(function () {}),
    );
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var path = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        var client = windows[i];
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus().then(function (c) {
            return c && "navigate" in c ? c.navigate(path) : undefined;
          });
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});

// The browser replaced the subscription (keys rotated, or it expired): save the new one.
self.addEventListener("pushsubscriptionchange", function (event) {
  var options = event.oldSubscription ? event.oldSubscription.options : null;
  if (!options) return;
  event.waitUntil(
    self.registration.pushManager.subscribe(options).then(function (subscription) {
      return fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    }),
  );
});
