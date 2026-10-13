import type { SocialErrorKey } from "./form-state";

/**
 * The wall's database functions raise short keys ("content_blocked", ...);
 * this turns them into message keys under "social.errors". Unknown errors
 * become "saveFailed".
 */
const fromDatabase: Record<string, SocialErrorKey> = {
  not_signed_in: "signedOut",
  group_not_found: "notFound",
  post_not_found: "postNotFound",
  comment_not_found: "postNotFound",
  member_not_found: "memberNotFound",
  report_not_found: "notFound",
  group_forbidden: "forbidden",
  group_archived: "archived",
  account_closing: "accountClosing",
  invalid_input: "invalidInput",
  content_blocked: "contentBlocked",
  pinned_full: "pinnedFull",
  nudge_already_sent: "nudgeAlreadySent",
  nudges_muted: "nudgesMuted",
  partner_already: "partnerAlready",
  partners_full: "partnersFull",
  partner_request_closed: "partnerRequestClosed",
  partnership_not_found: "partnershipNotFound",
  // The database's own limit (D-051), met only by calls that skip the app.
  rate_limited: "rateLimited",
};

export function socialErrorKey(error: { message?: string } | null | undefined): SocialErrorKey {
  return (error?.message && fromDatabase[error.message]) || "saveFailed";
}

/** Every key the database can produce, for the message-file test. */
export const databaseErrorKeys = Object.values(fromDatabase);
