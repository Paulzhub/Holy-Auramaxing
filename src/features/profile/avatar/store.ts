import { randomBytes } from "node:crypto";

import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { AVATAR_SIZES, type AvatarPixels } from "./image";
import { getImageScreener, type ImageScreener } from "./screening";

/**
 * Avatar storage and screening (D-026). Server only; uses the secret key,
 * always for one user id that the caller has already authenticated.
 *
 * Files: avatars/<user id>/<random>-<px>.webp. The random part (128 bits)
 * changes with every upload, so URLs never reveal anything and caches never
 * show an old photo.
 */

const BUCKET = "avatars";

export function newAvatarPath(userId: string): string {
  return `${userId}/${randomBytes(16).toString("base64url")}`;
}

export function avatarFile(path: string, px: AvatarPixels): string {
  return `${path}-${px}.webp`;
}

function filesFor(path: string): string[] {
  return AVATAR_SIZES.map((px) => avatarFile(path, px));
}

async function removeFiles(paths: (string | null | undefined)[]): Promise<void> {
  const files = paths.filter((p): p is string => Boolean(p)).flatMap(filesFor);
  if (files.length) await createSupabaseAdminClient().storage.from(BUCKET).remove(files);
}

interface AvatarRow {
  avatar_path: string | null;
  avatar_pending_path: string | null;
  avatar_status: string;
}

async function readRow(userId: string): Promise<AvatarRow | null> {
  const { data } = await createSupabaseAdminClient()
    .from("profiles")
    .select("avatar_path, avatar_pending_path, avatar_status")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

/**
 * Stores already-processed renditions as the user's pending avatar.
 * The current live avatar stays visible until screening approves the new one.
 */
export async function storePendingAvatar(userId: string, renditions: Record<AvatarPixels, Buffer>): Promise<string> {
  const admin = createSupabaseAdminClient();
  const path = newAvatarPath(userId);
  for (const px of AVATAR_SIZES) {
    const { error } = await admin.storage.from(BUCKET).upload(avatarFile(path, px), renditions[px], {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "31536000",
    });
    if (error) {
      await removeFiles([path]);
      throw new Error(`avatar upload to storage failed: ${error.message}`);
    }
  }

  const before = await readRow(userId);
  const { error } = await admin
    .from("profiles")
    .update({ avatar_pending_path: path, avatar_status: "pending_review" })
    .eq("id", userId);
  if (error) {
    await removeFiles([path]);
    throw new Error(`avatar save failed: ${error.message}`);
  }
  // An earlier photo still waiting for screening is replaced by this one.
  if (before?.avatar_pending_path) await removeFiles([before.avatar_pending_path]);
  await audit("avatar.uploaded", userId);
  return path;
}

/**
 * Screens the user's pending avatar, if any, and publishes or discards it.
 * Safe to call more than once: each step only applies to the same pending
 * path it started with. Returns the resulting status.
 */
export async function screenPendingAvatar(
  userId: string,
  screener: ImageScreener = getImageScreener(),
): Promise<"none" | "pending_review" | "ready" | "rejected"> {
  const admin = createSupabaseAdminClient();
  const row = await readRow(userId);
  const path = row?.avatar_pending_path;
  if (!row || !path) return (row?.avatar_status as "none" | "ready" | "rejected" | undefined) ?? "none";

  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(avatarFile(path, 512));
  if (!blob) {
    devLog("avatar", `could not read the pending photo for screening: ${downloadError?.message ?? "missing"}`);
    return "pending_review";
  }
  const verdict = await screener.screen(new Uint8Array(await blob.arrayBuffer()));
  if (verdict === "unavailable") {
    devLog("avatar", `screening unavailable (screener: ${screener.name}); the photo stays pending`);
    return "pending_review";
  }

  if (verdict === "approved") {
    const { data: updated } = await admin
      .from("profiles")
      .update({ avatar_path: path, avatar_pending_path: null, avatar_status: "ready" })
      .eq("id", userId)
      .eq("avatar_pending_path", path)
      .select("id");
    if (!updated?.length) return "pending_review"; // A newer upload replaced it meanwhile.
    if (row.avatar_path && row.avatar_path !== path) await removeFiles([row.avatar_path]);
    await audit("avatar.approved", userId, { screener: screener.name });
    return "ready";
  }

  // Rejected: the photo is deleted and never shown to anyone. The previous
  // avatar, if there was one, stays.
  await admin
    .from("profiles")
    .update({ avatar_pending_path: null, avatar_status: "rejected" })
    .eq("id", userId)
    .eq("avatar_pending_path", path);
  await removeFiles([path]);
  await audit("avatar.rejected", userId, { screener: screener.name });
  return "rejected";
}

/** Removes the live and any pending avatar; the profile falls back to initials. */
export async function removeAvatar(userId: string): Promise<void> {
  const row = await readRow(userId);
  await createSupabaseAdminClient()
    .from("profiles")
    .update({ avatar_path: null, avatar_pending_path: null, avatar_status: "none" })
    .eq("id", userId);
  await removeFiles([row?.avatar_path, row?.avatar_pending_path]);
  await audit("avatar.removed", userId);
}

/** Reads one stored rendition, for the avatar route. */
export async function readAvatarFile(path: string, px: AvatarPixels): Promise<ArrayBuffer | null> {
  const { data } = await createSupabaseAdminClient().storage.from(BUCKET).download(avatarFile(path, px));
  return data ? data.arrayBuffer() : null;
}
