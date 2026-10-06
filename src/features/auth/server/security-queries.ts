import { passkeysEnabled } from "@/lib/env";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SecurityOverview {
  twoStep: { on: boolean; recoveryCodesLeft: number };
  /** null when passkeys are switched off (PASSKEYS_ENABLED). */
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[] | null;
  sessions: { id: string; device: string | null; signedInAt: string; lastActiveAt: string; isCurrent: boolean }[];
}

/** Everything Settings → Security shows, read as the signed-in person. */
export async function getSecurityOverview(): Promise<SecurityOverview> {
  const supabase = await createSupabaseServerClient();
  const enabled = passkeysEnabled();
  const [factors, remaining, passkeys, sessions] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.rpc("recovery_codes_remaining"),
    enabled ? supabase.auth.passkey.list() : Promise.resolve(null),
    supabase.rpc("my_sessions"),
  ]);
  for (const result of [factors, remaining, passkeys, sessions]) {
    if (result?.error) devLog("security", result.error.message);
  }

  return {
    twoStep: { on: (factors.data?.totp.length ?? 0) > 0, recoveryCodesLeft: remaining.data ?? 0 },
    passkeys: passkeys
      ? (passkeys.data ?? []).map((p) => ({
          id: p.id,
          name: p.friendly_name || "Passkey",
          createdAt: p.created_at,
          lastUsedAt: p.last_used_at ?? null,
        }))
      : null,
    sessions: (sessions.data ?? []).map((s) => ({
      id: s.id,
      device: s.device,
      signedInAt: s.signed_in_at,
      lastActiveAt: s.last_active_at,
      isCurrent: s.is_current,
    })),
  };
}
