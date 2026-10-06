import type { ExportPart } from "@/lib/data-export";
import { decryptText } from "@/lib/security/encryption";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { readAvatarFile } from "../avatar/store";

/**
 * The profile module's part of "Download my data" (D-032): profile,
 * privacy and notification settings, the private "my why" (decrypted, since
 * it is the person's own) and their current photo. Read through RLS as the
 * signed-in person, so it can only ever be their own rows.
 */
export async function exportProfileData(userId: string): Promise<ExportPart> {
  const supabase = await createSupabaseServerClient();
  const [profile, privacy, notifications, personal] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "handle, display_name, bio, testimony, favourite_verse, timezone, locale, theme_pref, avatar_path, avatar_status, adult_confirmed_at, onboarded_at, deletion_requested_at, created_at, updated_at",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("privacy_settings")
      .select("profile_visibility, bio_visibility, testimony_visibility, verse_visibility, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("notification_settings")
      .select("reminder_time, discreet_mode, quiet_hours_start, quiet_hours_end, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profile_private").select("my_why_encrypted, updated_at").eq("user_id", userId).maybeSingle(),
  ]);
  for (const result of [profile, privacy, notifications, personal]) {
    if (result.error) throw new Error(`profile export: ${result.error.message}`);
  }
  if (!profile.data) throw new Error("profile export: no profile");

  const { avatar_path: avatarPath, ...profileRow } = profile.data;

  let myWhy: string | null = null;
  if (personal.data?.my_why_encrypted) {
    try {
      myWhy = decryptText(personal.data.my_why_encrypted, userId);
    } catch (error) {
      // A value that can't be decrypted (e.g. a rotated key) is left out
      // rather than failing the whole export.
      devLog("export", error);
    }
  }

  const files: ExportPart["files"] = [];
  if (avatarPath) {
    const photo = await readAvatarFile(avatarPath, 512);
    if (photo) files.push({ name: "avatar.webp", description: "Your profile photo.", data: new Uint8Array(photo) });
  }

  return {
    sections: [
      { name: "profile", description: "Your profile.", rows: [{ ...profileRow, has_photo: Boolean(avatarPath) }] },
      {
        name: "privacy_settings",
        description: "Who can see each part of your profile.",
        rows: privacy.data ? [privacy.data] : [],
      },
      {
        name: "notification_settings",
        description: "Reminder time, discreet mode and quiet hours.",
        rows: notifications.data ? [notifications.data] : [],
      },
      {
        name: "my_why",
        description: "Your private “my why”. Only you can read it.",
        rows: personal.data ? [{ my_why: myWhy, updated_at: personal.data.updated_at }] : [],
      },
    ],
    files,
  };
}
