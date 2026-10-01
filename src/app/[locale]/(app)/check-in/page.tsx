import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/ui/empty-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkIn") };
}

export default function Page() {
  const t = useTranslations("pages.checkIn");
  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <div className="stack">
        <EmptyState icon={<CircleCheck className="h-6 w-6" />} title={t("emptyTitle")} body={t("emptyBody")} />
      </div>
    </>
  );
}
