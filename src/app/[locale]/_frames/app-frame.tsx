import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { signOutAction } from "@/features/auth";
import { getMyGroups } from "@/features/groups";
import { GroupSwitcher } from "@/features/groups/ui";
import { getAlertsTopic, getUnreadCounts } from "@/features/notifications";
import { LiveAlerts } from "@/features/notifications/ui-live";
import { AppLock, appLockOwner } from "@/features/recovery";
import { getThemePreference } from "@/lib/server/theme";

/**
 * The signed-in app's frame: sidebar on desktop, bottom navigation on mobile,
 * the header with the group switcher, and the bell's unread counts with
 * their live updates (CLAUDE.md §7.8, §8). Used by the (app)
 * layout and, for signed-in people, by /join.
 */
export async function AppFrame({ userId, children }: { userId: string; children: ReactNode }) {
  const [theme, groups, t, tLive, counts, topic] = await Promise.all([
    getThemePreference(),
    getMyGroups(userId),
    getTranslations("groups.switcher"),
    getTranslations("notifications.live"),
    getUnreadCounts(),
    getAlertsTopic(),
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
    <AppShell
      theme={theme}
      switcher={switcher}
      alertCounts={counts}
      lock={<AppLock owner={appLockOwner(userId)} signOut={signOutAction} />}
      live={
        <LiveAlerts topic={topic} labels={{ newOne: tLive("newOne"), newMany: tLive("newMany", { count: "#" }) }} />
      }
    >
      {children}
    </AppShell>
  );
}
