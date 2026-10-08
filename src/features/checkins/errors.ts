import type en from "../../../messages/en.json";

export type CheckinErrorKey = keyof (typeof en)["checkins"]["errors"];

/**
 * The check-in functions raise short keys; this turns them into message keys
 * under "checkins.errors". Unknown errors become "saveFailed".
 */
const fromDatabase: Record<string, CheckinErrorKey> = {
  not_signed_in: "signedOut",
  account_closing: "accountClosing",
  checkin_window_closed: "windowClosed",
  checkin_invalid: "invalid",
  checkin_not_found: "notFound",
  // The database's own limit (D-051).
  rate_limited: "rateLimited",
};

export function checkinErrorKey(error: { message?: string } | null | undefined): CheckinErrorKey {
  return (error?.message && fromDatabase[error.message]) || "saveFailed";
}

/** Every key the app can put in ?error=, for the message-file test and for safe lookups. */
export const checkinErrorKeys: readonly CheckinErrorKey[] = [
  ...new Set([...Object.values(fromDatabase), "saveFailed", "rateLimited"] as CheckinErrorKey[]),
];

export function isCheckinErrorKey(value: unknown): value is CheckinErrorKey {
  return typeof value === "string" && (checkinErrorKeys as readonly string[]).includes(value);
}
