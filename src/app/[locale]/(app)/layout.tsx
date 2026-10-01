import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { getThemePreference } from "@/lib/server/theme";

// Everything inside the app is private: never indexed, never cached publicly.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const theme = await getThemePreference();
  return <AppShell theme={theme}>{children}</AppShell>;
}
