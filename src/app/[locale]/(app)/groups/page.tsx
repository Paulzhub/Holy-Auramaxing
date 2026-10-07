import { KeyRound, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAccount } from "@/features/auth";
import { getMyGroups, GroupList, GroupNotice } from "@/features/groups";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groups") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Every group I'm in, requests waiting, and ways to start or join one (CLAUDE.md §7.4). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { userId } = await requireAccount();
  const [t, groups, params] = await Promise.all([getTranslations(), getMyGroups(userId), searchParams]);

  const actions = (
    <div className="profile-actions">
      <Link href="/groups/new" className={buttonVariants({ variant: "primary" })}>
        <Plus aria-hidden="true" />
        {t("groups.list.create")}
      </Link>
      <Link href="/join" className={buttonVariants({ variant: "secondary" })}>
        <KeyRound aria-hidden="true" />
        {t("groups.list.joinWithCode")}
      </Link>
    </div>
  );

  return (
    <>
      <PageHeader title={t("pages.groups.title")} lede={t("pages.groups.lede")} />
      <GroupNotice notice={params.notice} error={params.error} />
      <div className="stack">
        {groups.length ? (
          <>
            {actions}
            <GroupList groups={groups} />
          </>
        ) : (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={t("pages.groups.emptyTitle")}
            body={t("pages.groups.emptyBody")}
            action={actions}
          />
        )}
      </div>
    </>
  );
}
