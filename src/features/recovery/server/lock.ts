import { createHash } from "node:crypto";

/**
 * Which account set this device's app lock (D-113): a hash of the account id,
 * not the id, so the lock never stores who someone is. It lets a different
 * account signing in on the same device skip (and forget) a lock that isn't
 * theirs.
 */
export function appLockOwner(userId: string): string {
  return createHash("sha256").update(`app-lock:${userId}`).digest("hex").slice(0, 32);
}
