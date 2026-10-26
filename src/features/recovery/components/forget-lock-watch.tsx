"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { CLEAR_COOKIE } from "@/lib/app-lock";

import { forgetLock } from "../lock-store";

const note = new RegExp(`(?:^|; )${CLEAR_COOKIE}=1(?:;|$)`);

/**
 * Any sign-out on this device forgets its app lock (D-113). A full page load
 * is handled by the boot script; a sign-out usually moves to the next page
 * without one, so this checks for the sign-out's one-minute note after every
 * page change too. Mounted once, in the root layout.
 */
export function ForgetLockWatch() {
  const pathname = usePathname();
  useEffect(() => {
    if (!note.test(document.cookie)) return;
    forgetLock();
    document.cookie = `${CLEAR_COOKIE}=; path=/; max-age=0`;
  }, [pathname]);
  return null;
}
