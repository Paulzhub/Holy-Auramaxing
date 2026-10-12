import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { getInviteDetail, GroupHeader, GroupNotice, requireGroup } from "@/features/groups";
import { InviteDetailActions } from "@/features/groups/ui-invites";
import { avatarUrl } from "@/features/profile";
import { Link } from "@/i18n/navigation";
import { clientMessages } from "@/i18n/client-messages";

// Tab title "Invites", like the list (D-035).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("groupInvites") };
}

type Params = Promise<{ groupId: string; inviteId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * One invite, for the group's owners and admins (D-076): who made it and
 * when, when it ends, its uses and status, and who joined or asked to join
 * with it. Another group's invite, or an unknown one, is "not found".
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { groupId, inviteId } = await params;
  const ctx = await requireGroup(groupId, "admin");
  const invite = await getInviteDetail(groupId, inviteId);
  if (!invite) notFound();
  const [t, format, query, messages] = await Promise.all([
    getTranslations("groups"),
    getFormatter(),
    searchParams,
    clientMessages(["groups"]),
  ]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const working = invite.state === "active" && !ctx.group.archivedAt;

  return (
    <>
      <GroupHeader ctx={ctx} current="invites" />
      <GroupNotice notice={query.notice} error={query.error} />
      <p>
        <Link href={`/groups/${groupId}/invites`}>{t("inviteDetail.back")}</Link>
      </p>
      <div className="stack">
        <section className="profile-section" aria-labelledby="invite-detail-title">
          <h2 id="invite-detail-title" className="profile-section__title">
            {t("inviteDetail.title")}
          </h2>
          <dl className="invite-facts" data-testid="invite-facts">
            <div>
              <dt>{t("inviteDetail.status")}</dt>
              <dd>{t(`invites.status.${invite.state}`)}</dd>
            </div>
            <div>
              <dt>{t("inviteDetail.madeBy")}</dt>
              <dd>
                {invite.createdBy ? invite.createdBy.name || t("inviteDetail.someone") : t("inviteDetail.formerMember")}
              </dd>
            </div>
            <div>
              <dt>{t("inviteDetail.madeOn")}</dt>
              <dd>{date(invite.createdAt)}</dd>
            </div>
            <div>
              <dt>{invite.state === "active" ? t("inviteDetail.worksUntil") : t("inviteDetail.ended")}</dt>
              <dd>
                {date(invite.revokedAt && invite.revokedAt < invite.expiresAt ? invite.revokedAt : invite.expiresAt)}
              </dd>
            </div>
            <div>
              <dt>{t("inviteDetail.uses")}</dt>
              <dd>
                {invite.maxUses !== null
                  ? t("invites.usesOf", { count: invite.useCount, max: invite.maxUses })
                  : t("invites.uses", { count: invite.useCount })}
              </dd>
            </div>
          </dl>
          {ctx.group.archivedAt ? null : (
            <NextIntlClientProvider messages={messages}>
              <InviteDetailActions groupId={groupId} inviteId={invite.id} working={working} />
            </NextIntlClientProvider>
          )}
        </section>

        <section className="profile-section" aria-labelledby="invite-people-title">
          <h2 id="invite-people-title" className="profile-section__title">
            {t("inviteDetail.peopleTitle")}
          </h2>
          {invite.people.length ? (
            <ul className="group-list" data-testid="invite-people">
              {invite.people.map((p) => (
                <li key={p.userId} className="group-row">
                  <Avatar
                    name={p.name || t("inviteDetail.someone")}
                    size="sm"
                    decorative
                    src={avatarUrl(p.userId, p.avatarPath, "sm")}
                  />
                  <div className="group-row__main">
                    <span className="group-row__title">{p.name || t("inviteDetail.someone")}</span>
                    <span className="text-muted">
                      {p.status === "pending"
                        ? t("inviteDetail.asked", { date: date(p.since) })
                        : t("inviteDetail.joined", { date: date(p.since) })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{t("inviteDetail.peopleEmpty")}</p>
          )}
          <p className="text-muted">{t("inviteDetail.peopleNote")}</p>
        </section>
      </div>
    </>
  );
}
