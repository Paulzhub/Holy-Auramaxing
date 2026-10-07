import { randomBytes } from "node:crypto";

import { z } from "zod";

import { getImageScreener, type ImageScreener } from "@/lib/images/screening";
import { SQUARE_IMAGE_SIZES, type SquareImagePixels } from "@/lib/images/square-image";
import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Group pictures (D-036): the avatar pipeline (D-026), for groups.
 *
 * Files: group-pictures/<group id>/<random>-<px>.webp, written by the server
 * only. Owners and admins upload; the database function
 * set_group_picture_pending() checks that role again, as the person. A
 * picture becomes visible only after screening approves it. Members fetch
 * it through /api/group-picture/<id>, which checks membership through RLS.
 */

const BUCKET = "group-pictures";

function pictureFile(path: string, px: SquareImagePixels): string {
  return `${path}-${px}.webp`;
}

async function removeFiles(paths: (string | null | undefined)[]): Promise<void> {
  const files = paths
    .filter((p): p is string => Boolean(p))
    .flatMap((p) => SQUARE_IMAGE_SIZES.map((px) => pictureFile(p, px)));
  if (files.length) await createSupabaseAdminClient().storage.from(BUCKET).remove(files);
}

export class GroupPictureRefused extends Error {
  constructor(readonly reason: string) {
    super(`group picture refused: ${reason}`);
  }
}

/**
 * Stores processed renditions as the group's pending picture. The caller
 * must be an owner or admin of the group: the files are only written after
 * a role check through RLS, and the database checks again when the picture
 * is recorded (the files are removed if it refuses).
 */
export async function storePendingGroupPicture(
  groupId: string,
  userId: string,
  renditions: Record<SquareImagePixels, Buffer>,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: me } = await supabase
    .from("group_members")
    .select("role, status")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!me || me.status !== "active" || me.role === "member") throw new GroupPictureRefused("group_forbidden");

  const admin = createSupabaseAdminClient();
  const path = `${groupId}/${randomBytes(16).toString("base64url")}`;
  for (const px of SQUARE_IMAGE_SIZES) {
    const { error } = await admin.storage.from(BUCKET).upload(pictureFile(path, px), renditions[px], {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "31536000",
    });
    if (error) {
      await removeFiles([path]);
      throw new Error(`group picture upload failed: ${error.message}`);
    }
  }

  const { data: previous, error } = await supabase.rpc("set_group_picture_pending", {
    p_group: groupId,
    p_path: path,
  });
  if (error) {
    await removeFiles([path]);
    throw new GroupPictureRefused(error.message);
  }
  // An earlier picture still waiting for screening is replaced by this one.
  if (previous) await removeFiles([previous]);
}

/**
 * Screens the group's pending picture, if any, and publishes or discards
 * it. Safe to call more than once. Runs with the secret key: it only ever
 * moves the group's own pending picture forward.
 */
export async function screenPendingGroupPicture(
  groupId: string,
  screener: ImageScreener = getImageScreener(),
): Promise<"none" | "pending_review" | "ready" | "rejected"> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("groups")
    .select("cover_path, cover_pending_path, cover_status")
    .eq("id", groupId)
    .maybeSingle();
  const path = row?.cover_pending_path;
  if (!row || !path) return (row?.cover_status as "none" | "ready" | "rejected" | undefined) ?? "none";

  const { data: blob } = await admin.storage.from(BUCKET).download(pictureFile(path, 512));
  if (!blob) return "pending_review";
  const verdict = await screener.screen(new Uint8Array(await blob.arrayBuffer()));
  if (verdict === "unavailable") {
    devLog("group-picture", `screening unavailable (screener: ${screener.name}); the picture stays pending`);
    return "pending_review";
  }

  if (verdict === "approved") {
    const { data: updated } = await admin
      .from("groups")
      .update({ cover_path: path, cover_pending_path: null, cover_status: "ready" })
      .eq("id", groupId)
      .eq("cover_pending_path", path)
      .select("id");
    if (!updated?.length) return "pending_review";
    if (row.cover_path && row.cover_path !== path) await removeFiles([row.cover_path]);
    await audit("group.picture_approved", null, { group: groupId, screener: screener.name });
    return "ready";
  }

  await admin
    .from("groups")
    .update({ cover_pending_path: null, cover_status: "rejected" })
    .eq("id", groupId)
    .eq("cover_pending_path", path);
  await removeFiles([path]);
  await audit("group.picture_rejected", null, { group: groupId, screener: screener.name });
  return "rejected";
}

/** Removes the live and pending picture (the database checks the role). */
export async function removeGroupPicture(groupId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: paths, error } = await supabase.rpc("remove_group_picture", { p_group: groupId });
  if (error) throw new GroupPictureRefused(error.message);
  await removeFiles(paths ?? []);
}

const querySchema = z.object({
  id: z.uuid(),
  px: z.coerce
    .number()
    .refine((n): n is SquareImagePixels => (SQUARE_IMAGE_SIZES as readonly number[]).includes(n))
    .default(256),
  v: z.string().max(64).optional(),
});

function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Serves a group's picture to its members (and people waiting to join).
 * The permission check is the groups table read as the viewer (RLS).
 * Unknown, hidden and missing pictures all look the same: 404.
 */
export async function serveGroupPicture(request: Request, id: string): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    id,
    px: url.searchParams.get("px") ?? undefined,
    v: url.searchParams.get("v") ?? undefined,
  });
  if (!parsed.success) return notFound();

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });

  const { data: group } = await supabase.from("groups").select("cover_path").eq("id", parsed.data.id).maybeSingle();
  if (!group?.cover_path) return notFound();

  const { data: blob } = await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .download(pictureFile(group.cover_path, parsed.data.px));
  if (!blob) return notFound();
  const bytes = await blob.arrayBuffer();

  const current = group.cover_path.slice(group.cover_path.indexOf("/") + 1);
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": parsed.data.v === current ? "private, max-age=86400, immutable" : "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      Vary: "Cookie",
    },
  });
}

/** For the data export: the picture of a group the person owns. */
export async function readGroupPicture(path: string): Promise<ArrayBuffer | null> {
  const { data } = await createSupabaseAdminClient().storage.from(BUCKET).download(pictureFile(path, 512));
  return data ? data.arrayBuffer() : null;
}
