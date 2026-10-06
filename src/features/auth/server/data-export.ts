import type { ExportPart } from "@/lib/data-export";
import { passkeysEnabled } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The auth module's part of "Download my data" (D-032): the account itself,
 * sign-in methods, consent records, passkeys, devices and the person's own
 * security events. No secrets: no password hash, no factor secrets, no
 * recovery codes (only their hashes are stored), no tokens, no IPs (none
 * are stored).
 */
export async function exportAuthData(): Promise<ExportPart> {
  const supabase = await createSupabaseServerClient();
  const [user, consents, factors, passkeys, sessions, events] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("consents").select("kind, policy_version, granted_at, withdrawn_at").order("granted_at"),
    supabase.auth.mfa.listFactors(),
    passkeysEnabled() ? supabase.auth.passkey.list() : Promise.resolve(null),
    supabase.rpc("my_sessions"),
    supabase.rpc("my_audit_events"),
  ]);
  for (const result of [user, consents, factors, sessions, events]) {
    if (result.error) throw new Error(`auth export: ${result.error.message}`);
  }
  const u = user.data.user;
  if (!u) throw new Error("auth export: no user");

  const methods = [...new Set((u.identities ?? []).map((i) => i.provider))].sort();

  return {
    sections: [
      {
        name: "account",
        description: "Your email address, how you sign in, and two-step sign-in.",
        rows: [
          {
            email: u.email ?? null,
            email_confirmed_at: u.email_confirmed_at ?? null,
            sign_in_methods: methods.join(" "),
            two_step_sign_in: (factors.data?.totp.length ?? 0) > 0,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at ?? null,
          },
        ],
      },
      {
        name: "consents",
        description: "What you agreed to at sign-up, and when.",
        rows: consents.data ?? [],
      },
      {
        name: "passkeys",
        description: "The passkeys you can sign in with.",
        rows: (passkeys?.data ?? []).map((p) => ({
          name: p.friendly_name || "Passkey",
          created_at: p.created_at,
          last_used_at: p.last_used_at ?? null,
        })),
      },
      {
        name: "devices",
        description: "Where you are signed in now.",
        rows: (sessions.data ?? []).map((s) => ({
          device: s.device,
          signed_in_at: s.signed_in_at,
          last_active_at: s.last_active_at,
          this_device: s.is_current,
        })),
      },
      {
        name: "security_events",
        description: "Sign-ins and other security events on your account (kept for one year).",
        rows: (events.data ?? []).map((e) => ({ event: e.action, at: e.created_at, device: e.device })),
      },
    ],
    files: [],
  };
}
