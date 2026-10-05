import { ChevronRight, CircleCheck, Pencil, Settings, Sprout } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAccount } from "@/features/auth";
import { getOwnProfile, type Visibility } from "@/features/profile";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("me") };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const [{ userId }, t, format, { saved }] = await Promise.all([
    requireAccount(),
    getTranslations(),
    getFormatter(),
    searchParams,
  ]);
  const profile = await getOwnProfile(userId);
  if (!profile) return null;
  const name = profile.displayName ?? profile.handle;
  const who = (v: Visibility) => t("profile.card.visibleTo", { who: t(`profile.visibility.${v}`) });

  const fields = [
    { title: t("profile.card.about"), body: profile.bio, visibility: profile.privacy.bioVisibility },
    { title: t("profile.card.verse"), body: profile.favouriteVerse, visibility: profile.privacy.verseVisibility },
    { title: t("profile.card.testimony"), body: profile.testimony, visibility: profile.privacy.testimonyVisibility },
  ];

  return (
    <>
      <PageHeader title={t("pages.me.title")} lede={t("pages.me.lede")} />
      <div className="stack">
        {saved ? (
          <p className="auth-banner" role="status">
            <CircleCheck aria-hidden="true" />
            {t("profile.card.saved")}
          </p>
        ) : null}

        <Card>
          <div className="grid gap-4">
            <div className="profile-hero">
              <Avatar name={name} src={profile.avatar.urls.xl} size="xl" decorative />
              <div className="grid gap-1">
                <h2 className="profile-hero__name">{name}</h2>
                <p className="profile-hero__meta">
                  {t("profile.card.joined", {
                    handle: profile.handle,
                    date: format.dateTime(new Date(profile.joinedAt), { month: "long", year: "numeric" }),
                  })}
                </p>
              </div>
            </div>
            {profile.avatar.status === "pending_review" ? (
              <p className="text-muted">{t("profile.avatar.pending")}</p>
            ) : null}
            <p className="text-muted">{t("profile.card.privateNote")}</p>
            <div className="profile-actions">
              <Link href="/me/edit" className={buttonVariants({ variant: "secondary" })}>
                <Pencil aria-hidden="true" />
                {t("profile.card.edit")}
              </Link>
            </div>
          </div>
        </Card>

        {fields.map((field) => (
          <Card key={field.title}>
            <div className="profile-field">
              <CardTitle as="h2">{field.title}</CardTitle>
              <p className={field.body ? "profile-field__body" : "profile-field__body text-muted"}>
                {field.body ?? t("profile.card.empty")}
              </p>
              <p className="profile-field__who">{who(field.visibility)}</p>
            </div>
          </Card>
        ))}

        <EmptyState
          icon={<Sprout className="h-6 w-6" />}
          title={t("pages.me.progressTitle")}
          body={t("pages.me.progressBody")}
        />

        <Link href="/settings" className="ui-card flex items-center gap-4">
          <Settings aria-hidden="true" className="h-6 w-6 flex-none" />
          <span className="grid flex-1">
            <span className="ui-card__title">{t("pages.me.settingsLink")}</span>
            <span className="text-muted">{t("pages.me.settingsBody")}</span>
          </span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 flex-none" />
        </Link>
      </div>
    </>
  );
}
