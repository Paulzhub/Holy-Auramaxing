import { createHash } from "node:crypto";

import { readServerEnv } from "@/lib/env";

export type BreachCheck = "breached" | "not_found" | "unavailable";

const RANGE_API = "https://api.pwnedpasswords.com/range/";

/**
 * Checks a password against Have I Been Pwned's breach corpus using the
 * k-anonymity range API: only the first 5 characters of the password's SHA-1
 * hash leave the server, and padding hides the response size.
 *
 * If the service can't be reached in time the result is "unavailable" and the
 * caller lets the password through (see docs/decisions.md D-017).
 */
export async function checkPwnedPassword(password: string, fetchImpl: typeof fetch = fetch): Promise<BreachCheck> {
  if (readServerEnv().HIBP_DISABLED === "true") return "unavailable";

  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const res = await fetchImpl(`${RANGE_API}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "aura-password-check" },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return "unavailable";
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, count] = line.trim().split(":");
      // Padding entries have a count of 0.
      if (hashSuffix === suffix && Number(count) > 0) return "breached";
    }
    return "not_found";
  } catch {
    return "unavailable";
  }
}
