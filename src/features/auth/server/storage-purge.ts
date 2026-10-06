import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Erasure, part two (D-033). The daily database job erases accounts whose
 * 14 days are over and queues their Storage folders, because files can only
 * be removed through the Storage API (deleting rows in SQL would leave the
 * files behind). This runs the same job on demand and then empties the
 * queue. Called by /api/cron/account-purge (Vercel Cron, or
 * `npm run accounts:purge` locally). Safe to run at any time, as often as
 * you like.
 */
export async function runAccountPurge(): Promise<{ erased: number; foldersEmptied: number; failed: number }> {
  const admin = createSupabaseAdminClient();
  const { data: erased, error } = await admin.rpc("run_account_purge");
  if (error) throw new Error(`run_account_purge: ${error.message}`);

  let foldersEmptied = 0;
  let failed = 0;
  // A few rounds at most per call; anything left waits for the next run.
  for (let round = 0; round < 5; round++) {
    const { data: claims, error: claimError } = await admin.rpc("claim_storage_purges", { p_limit: 20 });
    if (claimError) throw new Error(`claim_storage_purges: ${claimError.message}`);
    if (!claims?.length) break;
    for (const claim of claims) {
      try {
        await emptyFolder(claim.bucket, claim.prefix);
        const { error: doneError } = await admin.rpc("complete_storage_purge", { p_id: claim.id });
        if (doneError) throw new Error(doneError.message);
        foldersEmptied++;
      } catch (purgeError) {
        // Left in the queue; claimed again after 10 minutes.
        failed++;
        devLog("account", purgeError);
      }
    }
  }
  if (foldersEmptied > 0) await audit("account.storage_purged", null, { folders: foldersEmptied });
  return { erased: erased ?? 0, foldersEmptied, failed };
}

async function emptyFolder(bucket: string, prefix: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(prefix)) throw new Error("unexpected storage prefix");
  const storage = createSupabaseAdminClient().storage.from(bucket);
  for (let page = 0; page < 50; page++) {
    const { data, error } = await storage.list(prefix, { limit: 100 });
    if (error) throw new Error(`list ${bucket}: ${error.message}`);
    const files = (data ?? []).filter((f) => f.name && f.id !== null).map((f) => `${prefix}/${f.name}`);
    if (files.length === 0) return;
    const { error: removeError } = await storage.remove(files);
    if (removeError) throw new Error(`remove ${bucket}: ${removeError.message}`);
  }
  throw new Error("folder still not empty");
}
