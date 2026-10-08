import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getAccount } from "@/features/auth";

import { AppFrame } from "../_frames/app-frame";
import { AuthFrame } from "../_frames/auth-frame";

// Invite pages are never indexed (§7.4, §12); the page also sets no-referrer.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * /join is reachable signed out (invite links must work for new people), so
 * it can't live in (app), whose layout requires an account. It picks its
 * frame by session instead: the full app shell for signed-in, onboarded
 * people (sidebar, bottom nav, group switcher), and the sign-in frame for
 * everyone else, including accounts still in onboarding or closing.
 */
export default async function JoinLayout({ children }: { children: ReactNode }) {
  const account = await getAccount();
  const profile = account?.profile;
  if (account && profile && !account.blocked && profile.onboarded_at && !profile.deletion_requested_at) {
    return <AppFrame userId={account.userId}>{children}</AppFrame>;
  }
  return <AuthFrame>{children}</AuthFrame>;
}
