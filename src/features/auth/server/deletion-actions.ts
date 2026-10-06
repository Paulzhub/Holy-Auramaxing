"use server";

import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { consume } from "@/lib/security/rate-limit";
import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { requireSignedInAccount } from "./account";
import { queueSecurityAlert } from "./security-events";

/**
 * Deleting an account (CLAUDE.md §7.1; D-033). A request starts 14 days of
 * grace: the profile disappears from everyone else at once, other devices
 * are signed out, and signing in shows only the account-closing page, where
 * "Keep my account" undoes everything. After 14 days a database job erases
 * the account for good.
 *
 * Plain form posts, so no JavaScript is needed in the browser.
 */

async function go(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error("unreachable");
}

export async function requestAccountDeletionAction(formData: FormData): Promise<void> {
  const { userId, email, profile } = await requireSignedInAccount();
  if (profile.deletion_requested_at) await go("/account-closing");
  if (formData.get("confirm") !== "yes") await go("/settings/data/delete?error=confirm#delete-errors");
  if (!(await consume("accountDeletionByUser", userId)).ok)
    await go("/settings/data/delete?error=rate-limited#delete-errors");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_account_deletion");
  if (error || !data) {
    devLog("account", error?.message ?? "request_account_deletion returned nothing");
    await go("/settings/data/delete?error=failed#delete-errors");
  }
  await audit("account.deletion_requested", userId);
  await queueSecurityAlert("accountClosing", userId, email, { closesOn: new Date(data as string) });
  await go("/account-closing?notice=requested");
}

export async function keepAccountAction(): Promise<void> {
  const { userId, email, profile } = await requireSignedInAccount();
  if (!profile.deletion_requested_at) await go("/home");
  if (!(await consume("accountDeletionByUser", userId)).ok) await go("/account-closing?notice=rate-limited");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_account_deletion");
  if (error) {
    devLog("account", error.message);
    await go("/account-closing?notice=failed");
  }
  if (data) {
    await audit("account.deletion_cancelled", userId);
    await queueSecurityAlert("accountKept", userId, email);
  }
  await go("/settings/data?notice=account-kept");
}
