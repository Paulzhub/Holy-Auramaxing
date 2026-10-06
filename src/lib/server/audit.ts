import { headers } from "next/headers";

import { describeUserAgent } from "@/lib/security/request-info";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "auth.sign_in"
  | "auth.sign_in_failed"
  | "auth.sign_out"
  | "auth.password_changed"
  | "auth.oauth_signup_rejected"
  | "account.created"
  | "profile.updated"
  | "profile.privacy_changed"
  | "avatar.uploaded"
  | "avatar.approved"
  | "avatar.rejected"
  | "avatar.removed";

/**
 * Platform audit log (CLAUDE.md §10), shared by every module.
 *
 * Writes a security event to audit_log (CLAUDE.md §10). Never pass tokens,
 * passwords, email addresses or content in metadata. Failures are swallowed:
 * auditing must never break sign-in.
 */
export async function audit(
  action: AuditAction,
  actorId: string | null,
  metadata: Record<string, string | number | boolean> = {},
): Promise<void> {
  // Outside a request (e.g. inside after() from a page) there are no headers.
  let device: string | undefined;
  try {
    device = describeUserAgent((await headers()).get("user-agent"));
  } catch {
    device = undefined;
  }
  try {
    await createSupabaseAdminClient()
      .from("audit_log")
      .insert({
        actor_id: actorId,
        action,
        target_type: actorId ? "user" : null,
        target_id: actorId,
        metadata: device ? { ...metadata, device } : metadata,
      });
  } catch {
    // Best effort; see the monitoring plan in Phase 12.
  }
}
