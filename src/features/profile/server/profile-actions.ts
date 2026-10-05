"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireAccount } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { consume } from "@/lib/security/rate-limit";
import { audit } from "@/lib/server/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { AvatarImageError, processAvatar } from "../avatar/image";
import { removeAvatar, screenPendingAvatar, storePendingAvatar } from "../avatar/store";
import { type AvatarErrorKey, type AvatarFormState, parseProfileForm, type ProfileFormState } from "../profile-schema";

/** Saves the profile editor: the profile fields and the privacy settings. */
export async function saveProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const { userId } = await requireAccount();
  if (!(await consume("profileSaveByUser", userId)).ok) return { status: "error", formError: "rateLimited" };

  const parsed = parseProfileForm(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const v = parsed.values;

  // Both writes run as the user, through RLS and column grants.
  const supabase = await createSupabaseServerClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: v.displayName,
      handle: v.handle,
      bio: v.bio,
      testimony: v.testimony,
      favourite_verse: v.favouriteVerse,
    })
    .eq("id", userId);
  if (profileError) {
    if (profileError.code === "23505") return { status: "error", fieldErrors: { handle: "handleTaken" } };
    if (profileError.message.includes("handle_reserved")) {
      return { status: "error", fieldErrors: { handle: "handleReserved" } };
    }
    return { status: "error", formError: "saveFailed" };
  }

  const { data: before } = await supabase
    .from("privacy_settings")
    .select(
      "profile_visibility, bio_visibility, testimony_visibility, verse_visibility, show_in_leaderboards, default_share_level",
    )
    .eq("user_id", userId)
    .single();
  const privacy = {
    profile_visibility: v.profileVisibility,
    bio_visibility: v.bioVisibility,
    testimony_visibility: v.testimonyVisibility,
    verse_visibility: v.verseVisibility,
    show_in_leaderboards: v.showInLeaderboards,
    default_share_level: v.defaultShareLevel,
  };
  const { error: privacyError } = await supabase.from("privacy_settings").update(privacy).eq("user_id", userId);
  if (privacyError) return { status: "error", formError: "saveFailed" };

  await audit("profile.updated", userId);
  const changed = before
    ? (Object.keys(privacy) as (keyof typeof privacy)[]).filter((k) => before[k] !== privacy[k])
    : [];
  // Which settings changed, never the profile text itself.
  if (changed.length) await audit("profile.privacy_changed", userId, { fields: changed.join(",") });

  revalidatePath("/[locale]/me", "layout");
  redirect({ href: "/me?saved=1", locale: await getLocale() });
  return { status: "idle" };
}

const avatarErrors: Record<AvatarImageError["reason"], AvatarErrorKey> = {
  type: "avatarType",
  size: "avatarSize",
  unreadable: "avatarUnreadable",
  tooSmall: "avatarTooSmall",
};

/**
 * Receives a photo (normally already cropped and shrunk in the browser),
 * re-encodes it here, stores it as pending and screens it after the
 * response is sent.
 */
export async function uploadAvatarAction(_prev: AvatarFormState, formData: FormData): Promise<AvatarFormState> {
  const { userId } = await requireAccount();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { status: "error", error: "avatarType" };
  if (!(await consume("avatarUploadByUser", userId)).ok) return { status: "error", error: "rateLimited" };

  let renditions;
  try {
    renditions = await processAvatar(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    return {
      status: "error",
      error: error instanceof AvatarImageError ? avatarErrors[error.reason] : "avatarUnreadable",
    };
  }

  try {
    await storePendingAvatar(userId, renditions);
  } catch {
    return { status: "error", error: "saveFailed" };
  }

  // Screening calls an outside service, so it never holds up the response.
  // Phase 7's job queue takes this over (D-026).
  after(() => screenPendingAvatar(userId));
  revalidatePath("/[locale]/me", "layout");
  return { status: "uploaded" };
}

export async function removeAvatarAction(): Promise<AvatarFormState> {
  const { userId } = await requireAccount();
  try {
    await removeAvatar(userId);
  } catch {
    return { status: "error", error: "saveFailed" };
  }
  revalidatePath("/[locale]/me", "layout");
  return { status: "removed" };
}
