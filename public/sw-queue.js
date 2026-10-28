/*
 * Holy Auramaxing: the offline check-in queue's sender (CLAUDE.md §7.5, §13;
 * D-126). Loaded by sw.js with importScripts, and by the unit tests.
 *
 * Check-ins made offline wait in IndexedDB ("ha-pwa" → "queue"), each with
 * the day it is for and the time it was made. This sends them, oldest first,
 * to POST /api/checkins/sync, and removes one only after the server answers:
 * { status } (saved) or { drop: true } (it will never be accepted: too old,
 * already answered, outside its window). Anything else (offline, signed out,
 * rate limited, a server error) keeps it for the next try. The server refuses
 * a repeat (D-122), so each check-in is saved exactly once.
 *
 * A check-in is only ever sent for the person who made it: if someone else is
 * signed in on this device now, it waits for its owner.
 *
 * Keep the names below in step with src/lib/pwa/constants.ts and the rules
 * with src/lib/pwa/queue.ts (src/lib/pwa/pwa.test.ts checks both).
 */
"use strict";

(function (root) {
  var DB_NAME = "ha-pwa";
  var DB_VERSION = 1;
  var QUEUE_STORE = "queue";
  var META_STORE = "meta";
  var QUEUE_MAX_AGE_DAYS = 7;
  var SYNC_URL = "/api/checkins/sync";

  /** Opens the store; one made without our stores (by anything else) is replaced once. */
  async function openDb() {
    var db = await openOnce();
    if (db.objectStoreNames.contains(QUEUE_STORE) && db.objectStoreNames.contains(META_STORE)) return db;
    db.close();
    await new Promise(function (resolve) {
      var request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess =
        request.onerror =
        request.onblocked =
          function () {
            resolve();
          };
    });
    return openOnce();
  }

  function openOnce() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function req(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function isExpired(item, nowMs) {
    var made = Date.parse(item && item.recordedAt);
    return !isFinite(made) || nowMs - made > QUEUE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  }

  /** "sent" | "drop" | "keep", exactly as replyAction in src/lib/pwa/queue.ts. */
  function replyAction(httpStatus, body) {
    var b = body && typeof body === "object" ? body : {};
    if (httpStatus >= 200 && httpStatus < 300 && typeof b.status === "string") return "sent";
    if (b.drop === true) return "drop";
    return "keep";
  }

  /**
   * The JSON for POST /api/checkins/sync: the queued item as it is, with its
   * owner and day under the route's names (syncPayload in queue.ts).
   */
  function payload(item) {
    var body = { forUser: item.userId, date: item.localDate };
    Object.keys(item).forEach(function (key) {
      if (key !== "id" && key !== "userId" && key !== "localDate") body[key] = item[key];
    });
    return body;
  }

  async function remove(id) {
    var db = await openDb();
    try {
      await req(db.transaction(QUEUE_STORE, "readwrite").objectStore(QUEUE_STORE).delete(id));
    } finally {
      db.close();
    }
  }

  async function snapshot() {
    var db = await openDb();
    try {
      var tx = db.transaction([QUEUE_STORE, META_STORE]);
      var items = await req(tx.objectStore(QUEUE_STORE).getAll());
      var session = await req(tx.objectStore(META_STORE).get("session"));
      return { items: items || [], session: session || null };
    } finally {
      db.close();
    }
  }

  /**
   * What was saved, kept for the app to say so the next time a page of it is
   * open (the person may be on the offline page, or not in the app at all,
   * when the browser sends the queue). The day only, never the answer.
   */
  async function keepNotices(sent) {
    if (!sent.length) return;
    var db = await openDb();
    try {
      var tx = db.transaction(META_STORE, "readwrite");
      var store = tx.objectStore(META_STORE);
      var before = (await req(store.get("notices"))) || [];
      var next = before
        .concat(
          sent.map(function (s) {
            return { localDate: s.localDate, noteLost: s.noteLost };
          }),
        )
        .slice(-10);
      store.put(next, "notices");
      await new Promise(function (resolve) {
        tx.oncomplete =
          tx.onerror =
          tx.onabort =
            function () {
              resolve();
            };
      });
    } finally {
      db.close();
    }
  }

  var running = null;

  /**
   * Sends what can be sent now. Returns what happened, for the open pages:
   * { sent: [{ localDate, status, noteLost }], dropped, waiting }.
   * Never two at once (a Background Sync and a page asking at the same time).
   */
  function flush(fetchImpl) {
    if (running) return running;
    var doFetch = fetchImpl || fetch;
    running = (async function () {
      var result = { sent: [], dropped: 0, waiting: 0 };
      var snap;
      try {
        snap = await snapshot();
      } catch {
        return result;
      }
      var now = Date.now();
      var items = snap.items.slice().sort(function (a, b) {
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      var stop = false;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (isExpired(item, now)) {
          await remove(item.id).catch(function () {});
          result.dropped++;
          continue;
        }
        if (stop || !snap.session || snap.session.userId !== item.userId) {
          result.waiting++;
          continue;
        }
        var response;
        try {
          response = await doFetch(SYNC_URL, {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload(item)),
          });
        } catch {
          // Still offline: try again later, and don't knock on the door for the rest.
          stop = true;
          result.waiting++;
          continue;
        }
        var body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        var action = replyAction(response.status, body);
        if (action === "sent") {
          await remove(item.id).catch(function () {});
          result.sent.push({ localDate: item.localDate, status: body.status, noteLost: body.noteLost === true });
        } else if (action === "drop") {
          await remove(item.id).catch(function () {});
          result.dropped++;
        } else {
          result.waiting++;
          // Signed out, rate limited or a server error: the rest would fail the same way.
          if (response.status === 401 || response.status === 429 || response.status >= 500) stop = true;
        }
      }
      await keepNotices(result.sent).catch(function () {});
      return result;
    })().finally(function () {
      running = null;
    });
    return running;
  }

  root.haQueue = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    QUEUE_STORE: QUEUE_STORE,
    META_STORE: META_STORE,
    QUEUE_MAX_AGE_DAYS: QUEUE_MAX_AGE_DAYS,
    flush: flush,
    replyAction: replyAction,
    isExpired: isExpired,
    payload: payload,
  };
})(typeof self !== "undefined" ? self : globalThis);
