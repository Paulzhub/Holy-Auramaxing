"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { CLEAR_COOKIE } from "@/lib/app-lock";
import { SW_MESSAGES } from "@/lib/pwa/constants";
import { forgetDevice } from "@/lib/pwa/store";

import { forgetLock } from "../lock-store";

const note = new RegExp(`(?:^|; )${CLEAR_COOKIE}=1(?:;|$)`);

/**
 * Any sign-out on this device forgets its app lock (D-113), and the
 * installable app's data on this device (D-126). A full page load
 * is handled by the boot script; a sign-out usually moves to the next page
 * without one, so this checks for the sign-out's one-minute note after every
 * page change too. Mounted once, in the root layout.
 */
export function ForgetLockWatch() {
  const pathname = usePathname();
  useEffect(() => {
    if (!note.test(document.cookie)) return;
    forgetLock();
    // The offline queue, who was signed in here, and the worker's caches (D-126).
    void forgetDevice();
    navigator.serviceWorker?.controller?.postMessage(SW_MESSAGES.forget);
    document.cookie = `${CLEAR_COOKIE}=; path=/; max-age=0`;
  }, [pathname]);
  return null;
}
