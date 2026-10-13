import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import {
  DevicesSection,
  getNotificationSettings,
  getPushDevices,
  NotificationNotice,
  NotificationSettingsPanel,
} from "@/features/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("notificationSettings") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** What reaches me, and when (CLAUDE.md §7.8, §7.10; D-090). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId, profile }, query, t] = await Promise.all([
    requireAccount(),
    searchParams,
    getTranslations("notifications.settings"),
  ]);
  const [settings, devices] = await Promise.all([getNotificationSettings(userId), getPushDevices()]);
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <NotificationNotice notice={query.notice} error={query.error} scope="settings" />
      <NotificationSettingsPanel
        settings={settings}
        timeZone={profile.timezone}
        devices={<DevicesSection devices={devices} timeZone={profile.timezone} />}
      />
    </>
  );
}
