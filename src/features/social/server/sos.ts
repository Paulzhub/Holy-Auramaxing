import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { SocialErrorKey } from "../form-state";
import { socialErrorKey } from "../errors";
import { postBodySchema, uuidSchema } from "../schemas";

/**
 * The SOS sheet's two social quick actions (CLAUDE.md §7.9), for the
 * recovery module. The caller has already checked who is signed in and
 * applied the app's rate limit; the database checks everything again.
 */

/** Let my partners know, where I allowed it (partner SOS, high urgency, D-089). */
export async function sendPartnerSos(): Promise<SocialErrorKey | null> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("send_partner_sos", {});
  return error ? socialErrorKey(error) : null;
}

/** Post a prayer request on one of my groups' walls. */
export async function askGroupForPrayer(groupId: string, body: string): Promise<SocialErrorKey | null> {
  const text = postBodySchema.safeParse(body);
  if (!uuidSchema.safeParse(groupId).success || !text.success) return "invalidInput";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_post", {
    p_group: groupId,
    p_kind: "prayer_request",
    p_body: text.data,
  });
  return error ? socialErrorKey(error) : null;
}
