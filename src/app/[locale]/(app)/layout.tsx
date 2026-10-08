import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";

import { AppFrame } from "../_frames/app-frame";

// Everything inside the app is private: never indexed, never cached publicly.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Redirects to sign-in when signed out (the proxy usually got there first).
  const { profile, userId } = await requireAccount();
  // New accounts go through onboarding first (CLAUDE.md §7.2); it can be skipped.
  if (!profile.onboarded_at) redirect({ href: "/welcome", locale: await getLocale() });
  return <AppFrame userId={userId}>{children}</AppFrame>;
}
