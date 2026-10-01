import { ChevronRight, Settings, Sprout } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("me") };
}

export default function Page() {
  const t = useTranslations("pages.me");
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <div className="stack">
        <Link href="/settings" className="ui-card flex items-center gap-4">
          <Settings aria-hidden="true" className="h-6 w-6 flex-none" />
          <span className="grid flex-1">
            <span className="ui-card__title">{t("settingsLink")}</span>
            <span className="text-muted">{t("settingsBody")}</span>
          </span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 flex-none" />
        </Link>
        <EmptyState icon={<Sprout className="h-6 w-6" />} title={t("emptyTitle")} body={t("emptyBody")} />
      </div>
    </>
  );
}
