import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/app-shell";
import { requireAccount } from "@/features/auth";
import { getOwnProfile } from "@/features/profile";
import { AvatarEditor, ProfileForm } from "@/features/profile/ui";
import { clientMessages } from "@/i18n/client-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("editProfile") };
}

export default async function Page() {
  const { userId } = await requireAccount();
  const [profile, t, messages] = await Promise.all([
    getOwnProfile(userId),
    getTranslations("profile.editor"),
    clientMessages(["profile"]),
  ]);
  if (!profile) return null;

  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <NextIntlClientProvider messages={messages}>
        <div className="stack">
          <AvatarEditor
            name={profile.displayName ?? profile.handle}
            src={profile.avatar.urls.xl}
            status={profile.avatar.status}
            hasPending={profile.avatar.hasPending}
          />
          <ProfileForm
            values={{
              displayName: profile.displayName ?? "",
              handle: profile.handle,
              bio: profile.bio ?? "",
              testimony: profile.testimony ?? "",
              favouriteVerse: profile.favouriteVerse ?? "",
              ...profile.privacy,
            }}
          />
        </div>
      </NextIntlClientProvider>
    </>
  );
}
