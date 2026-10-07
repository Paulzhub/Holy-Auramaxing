import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import { todayIn } from "@/features/groups";
import { CreateGroupWizard } from "@/features/groups/ui-create";
import { clientMessages } from "@/i18n/client-messages";
import { timezoneOptions } from "@/lib/timezones";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupNew") };
}

/** "Start a group": the five-step wizard (CLAUDE.md §7.4). */
export default async function Page() {
  const { profile } = await requireAccount();
  const [t, messages] = await Promise.all([getTranslations("groups"), clientMessages(["groups"])]);
  return (
    <>
      <PageHeader title={t("list.create")} lede={t("create.lede")} />
      <NextIntlClientProvider messages={messages}>
        <CreateGroupWizard
          timezones={timezoneOptions(profile.timezone)}
          defaultTimezone={profile.timezone}
          today={todayIn(profile.timezone)}
        />
      </NextIntlClientProvider>
    </>
  );
}
