import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { getThemePreference } from "@/lib/server/theme";
import { requireAccount } from "@/features/auth";
import { getMyGroups } from "@/features/groups";
import { GroupSwitcher } from "@/features/groups/ui";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

// Everything inside the app is private: never indexed, never cached publicly.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Redirects to sign-in when signed out (the proxy usually got there first).
  const { profile, userId } = await requireAccount();
  // New accounts go through onboarding first (CLAUDE.md §7.2); it can be skipped.
  if (!profile.onboarded_at) redirect({ href: "/welcome", locale: await getLocale() });
  const [theme, groups, t] = await Promise.all([
    getThemePreference(),
    getMyGroups(userId),
    getTranslations("groups.switcher"),
  ]);
  const switcher = (
    <GroupSwitcher
      groups={groups
        .filter((g) => g.status === "active" && !g.archivedAt)
        .map((g) => ({ id: g.id, name: g.name, pictureUrl: g.pictureUrl }))}
      labels={{ label: t("label"), none: t("none"), all: t("all"), create: t("create") }}
    />
  );
  return (
    <AppShell theme={theme} switcher={switcher}>
      {children}
    </AppShell>
  );
}
