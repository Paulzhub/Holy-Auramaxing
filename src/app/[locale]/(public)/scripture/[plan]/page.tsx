import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { publicMetadata, ScripturePlan } from "@/features/marketing";
import { planBySlug } from "@/features/recovery";

type Params = Promise<{ plan: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const plan = planBySlug((await params).plan);
  if (!plan) return {};
  const [t, tPlans] = await Promise.all([
    getTranslations("marketing.pages.scripturePlan"),
    getTranslations("reading.plans"),
  ]);
  return publicMetadata({
    title: t("title", { plan: tPlans(`${plan.titleKey}.title`) }),
    description: t("description", { body: tPlans(`${plan.titleKey}.body`) }),
    path: `/scripture/${plan.slug}`,
  });
}

/** A reading plan's public preview (§12, D-117). */
export default async function Page({ params }: { params: Params }) {
  const plan = planBySlug((await params).plan);
  if (!plan) notFound();
  return <ScripturePlan slug={plan.slug} />;
}
