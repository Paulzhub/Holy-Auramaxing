import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { SQUARE_IMAGE_SIZES, type SquareImagePixels } from "@/lib/images/square-image";
import { readAvatarFile } from "../avatar/store";

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
 * Serves an avatar to a signed-in viewer who is allowed to see that profile.
 * The permission check is public.profile_cards, read as the viewer, so the
 * owner's privacy settings and group membership decide (RLS, D-022).
 * Unknown, hidden and missing avatars all look the same: 404.
 */
export async function serveAvatar(request: Request, id: string): Promise<Response> {
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

  const { data: card } = await supabase
    .from("profile_cards")
    .select("avatar_path")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!card?.avatar_path) return notFound();

  const bytes = await readAvatarFile(card.avatar_path, parsed.data.px);
  if (!bytes) return notFound();

  const current = card.avatar_path.slice(card.avatar_path.indexOf("/") + 1);
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      // Private: only this browser may keep it. A versioned URL never
      // changes, so it can be kept for a long time.
      "Cache-Control": parsed.data.v === current ? "private, max-age=86400, immutable" : "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      Vary: "Cookie",
    },
  });
}
