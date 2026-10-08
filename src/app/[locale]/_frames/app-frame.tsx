import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { getMyGroups } from "@/features/groups";
import { GroupSwitcher } from "@/features/groups/ui";
import { getThemePreference } from "@/lib/server/theme";

/**
 * The signed-in app's frame: sidebar on desktop, bottom navigation on mobile,
 * and the header with the group switcher (CLAUDE.md §8). Used by the (app)
 * layout and, for signed-in people, by /join.
 */
export async function AppFrame({ userId, children }: { userId: string; children: ReactNode }) {
  const [theme, groups, t] = await Promise.all([
    getThemePreference(),
    getMyGroups(userId),
    getTranslations("groups.switcher"),
  ]);
  const switcher = (
    <GroupSwitcher
      groups={groups
        .filter((g) => g.status === "active" && !g.archivedAt)
        .map((g) => ({ id: g.id, name: g.name, pictureUrl: g.pictureUrl, needsAnswer: g.needsMyAnswer }))}
      labels={{ label: t("label"), none: t("none"), all: t("all"), create: t("create"), needsAnswer: t("needsAnswer") }}
    />
  );
  return (
    <AppShell theme={theme} switcher={switcher}>
      {children}
    </AppShell>
  );
}
