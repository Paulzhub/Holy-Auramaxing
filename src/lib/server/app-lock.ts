import { cookies } from "next/headers";

import { CLEAR_COOKIE } from "@/lib/app-lock";

/**
 * Any sign-out on this device also forgets its app lock (owner, 2026-10-26,
 * D-113): the next person to sign in here starts fresh. The lock lives in
 * the browser's storage, so the server can only leave a note: a one-minute
 * cookie that the boot script (src/lib/app-lock.ts) acts on at the next page.
 * It says nothing about the account or the app.
 */
export async function forgetAppLockOnThisDevice(): Promise<void> {
  (await cookies()).set(CLEAR_COOKIE, "1", {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60,
  });
}
