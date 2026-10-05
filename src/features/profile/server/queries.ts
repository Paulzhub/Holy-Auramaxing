import { after } from "next/server";
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { screenPendingAvatar } from "../avatar/store";
import { avatarUrl } from "../avatar/url";
import type { ShareLevel, Visibility } from "../profile-schema";

export interface OwnProfile {
  id: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  testimony: string | null;
  favouriteVerse: string | null;
  joinedAt: string;
  avatar: {
    status: "none" | "pending_review" | "ready" | "rejected";
    /** The live avatar, at each display size. */
    urls: { md?: string; xl?: string };
    hasPending: boolean;
  };
  privacy: {
    profileVisibility: Visibility;
    bioVisibility: Visibility;
    testimonyVisibility: Visibility;
    verseVisibility: Visibility;
    showInLeaderboards: boolean;
    defaultShareLevel: ShareLevel;
  };
}

/** The signed-in user's own profile and privacy settings, read through RLS. */
export const getOwnProfile = cache(async (userId: string): Promise<OwnProfile | null> => {
  const supabase = await createSupabaseServerClient();
  const [{ data: p }, { data: s }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, handle, display_name, bio, testimony, favourite_verse, created_at, avatar_path, avatar_pending_path, avatar_status",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("privacy_settings")
      .select(
        "profile_visibility, bio_visibility, testimony_visibility, verse_visibility, show_in_leaderboards, default_share_level",
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!p || !s) return null;

  // A photo still waiting (for example after a screening outage) gets
  // another try whenever its owner looks at their profile.
  if (p.avatar_pending_path) after(() => screenPendingAvatar(userId));

  return {
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    bio: p.bio,
    testimony: p.testimony,
    favouriteVerse: p.favourite_verse,
    joinedAt: p.created_at,
    avatar: {
      status: p.avatar_status as OwnProfile["avatar"]["status"],
      urls: { md: avatarUrl(p.id, p.avatar_path, "md"), xl: avatarUrl(p.id, p.avatar_path, "xl") },
      hasPending: Boolean(p.avatar_pending_path),
    },
    privacy: {
      profileVisibility: s.profile_visibility as Visibility,
      bioVisibility: s.bio_visibility as Visibility,
      testimonyVisibility: s.testimony_visibility as Visibility,
      verseVisibility: s.verse_visibility as Visibility,
      showInLeaderboards: s.show_in_leaderboards,
      defaultShareLevel: s.default_share_level as ShareLevel,
    },
  };
});
