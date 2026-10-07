import { KeyRound, Users } from "lucide-react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { AuthHeading, getAccount, requireSignedInAccount } from "@/features/auth";
import { CovenantSummary, detailsOfHeldInvite, previewHeldInvite } from "@/features/groups";
import { InviteCodeForm, JoinForm } from "@/features/groups/ui-join";
import { clientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";

// Invite pages are never indexed, and show only a group's name and member
// count until someone signs in (CLAUDE.md §7.4, §12).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("join"), robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
}

/**
 * /join: where invite links, QR codes and short codes land (D-037).
 * The invite itself travels in an httpOnly cookie, set by /join/<token> or
 * by the code form, so this page's URL never carries a secret.
 */
export default async function Page() {
  const [t, format, account] = await Promise.all([getTranslations("groups"), getFormatter(), getAccount()]);

  // ---------------------------------------------------------------- signed out
  if (!account) {
    const preview = await previewHeldInvite();
    return (
      <div className="auth-card">
        <Users aria-hidden="true" className="auth-card__icon" />
        {preview && preview.groupName ? (
          <>
            <AuthHeading
              title={t("join.invitedTo", { name: preview.groupName })}
              lede={t("join.members", { count: preview.memberCount ?? 0 })}
            />
            {preview.status === "valid" ? (
              <>
                <p>{t("join.signedOutBody")}</p>
                <div className="profile-actions">
                  <Link href="/sign-up" className={buttonVariants({ variant: "primary" })}>
                    {t("join.signUp")}
                  </Link>
                  <Link href="/sign-in?next=/join" className={buttonVariants({ variant: "secondary" })}>
                    {t("join.signIn")}
                  </Link>
                </div>
              </>
            ) : (
              <p className="auth-banner" role="status">
                {t(`join.status.${preview.status}`)}
              </p>
            )}
          </>
        ) : (
          <>
            <AuthHeading title={t("join.title")} lede={preview ? t("join.status.invalid") : t("join.noInvite")} />
            <div className="profile-actions">
              <Link href="/sign-in?next=/join" className={buttonVariants({ variant: "primary" })}>
                {t("join.signIn")}
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- signed in
  const { profile } = await requireSignedInAccount();
  const [details, messages] = await Promise.all([detailsOfHeldInvite(), clientMessages(["groups"])]);

  const codeSection = (
    <section className="stack-sm" aria-labelledby="code-title">
      <h2 id="code-title" className="profile-section__title">
        <KeyRound aria-hidden="true" className="inline-icon" /> {t("join.codeTitle")}
      </h2>
      <p className="text-muted">{t("join.codeLede")}</p>
      <InviteCodeForm />
    </section>
  );

  if (profile.deletion_requested_at) {
    return (
      <div className="auth-card">
        <AuthHeading title={t("join.title")} lede={t("errors.accountClosing")} />
      </div>
    );
  }

  if (!details || details.status === "invalid" || !details.groupName) {
    return (
      <div className="auth-card">
        <Users aria-hidden="true" className="auth-card__icon" />
        <AuthHeading title={t("join.title")} lede={details ? t("join.status.invalid") : t("join.noInvite")} />
        <NextIntlClientProvider messages={messages}>{codeSection}</NextIntlClientProvider>
      </div>
    );
  }

  const name = details.groupName;
  if (details.myStatus) {
    return (
      <div className="auth-card">
        <Users aria-hidden="true" className="auth-card__icon" />
        <AuthHeading
          title={t("join.invitedTo", { name })}
          lede={
            details.myStatus === "active"
              ? t("join.alreadyMember", { name })
              : details.myStatus === "pending"
                ? t("join.alreadyRequested", { name })
                : t("join.removed", { name })
          }
        />
        {details.myStatus === "active" && details.groupId ? (
          <div>
            <Link href={`/groups/${details.groupId}`} className={buttonVariants({ variant: "primary" })}>
              {t("join.openGroup")}
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  if (details.status !== "valid") {
    return (
      <div className="auth-card">
        <Users aria-hidden="true" className="auth-card__icon" />
        <AuthHeading title={t("join.invitedTo", { name })} lede={t(`join.status.${details.status}`)} />
        <NextIntlClientProvider messages={messages}>{codeSection}</NextIntlClientProvider>
      </div>
    );
  }

  const challenge =
    details.challengeType === "custom"
      ? t("invites.days", { count: details.challengeDays ?? 0 })
      : details.challengeType
        ? t(`challengeTypes.${details.challengeType}`)
        : "";

  return (
    <div className="auth-card">
      <Users aria-hidden="true" className="auth-card__icon" />
      <AuthHeading
        title={t("join.invitedTo", { name })}
        lede={t("join.members", { count: details.memberCount ?? 0 })}
      />
      {details.description ? <p className="group-description">{details.description}</p> : null}
      <dl className="group-facts">
        <div>
          <dt>{t("join.challenge")}</dt>
          <dd>{challenge}</dd>
        </div>
        {details.startDate ? (
          <div>
            <dt>{t("fields.startDate")}</dt>
            <dd>
              {t("join.starts", {
                date: format.dateTime(new Date(`${details.startDate}T12:00:00Z`), {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }),
              })}
            </dd>
          </div>
        ) : null}
        {details.timezone ? (
          <div>
            <dt>{t("fields.timezone")}</dt>
            <dd>{t("join.timezone", { zone: details.timezone.replaceAll("_", " ") })}</dd>
          </div>
        ) : null}
      </dl>
      <CovenantSummary
        text={details.covenantText ?? ""}
        minShareLevel={details.minShareLevel ?? "checkin_only"}
        hidingAllowed={Boolean(details.leaderboardHidingAllowed)}
      />
      <NextIntlClientProvider messages={messages}>
        <JoinForm
          minShareLevel={details.minShareLevel ?? "checkin_only"}
          hidingAllowed={Boolean(details.leaderboardHidingAllowed)}
          covenantSeen={details.covenantUpdatedAt ?? ""}
          needsApproval={details.joinPolicy === "request_to_join"}
        />
      </NextIntlClientProvider>
    </div>
  );
}
