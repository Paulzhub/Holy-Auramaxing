"use client";

import { useEffect } from "react";

/**
 * Makes SOS work offline (CLAUDE.md §7.9, D-106): registers the app's service
 * worker for everyone signed in (until now only push did), and asks it to keep
 * its copy of /breathe fresh. The worker caches nothing personal.
 */
export function OfflineReady() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.active?.postMessage("refresh-offline"))
      .catch(() => {
        // No service worker here (private browsing, an old browser): SOS still works while online.
      });
  }, []);
  return null;
}
