/**
 * The version of the Terms, Privacy Policy and sensitive-data notice that a
 * new account agrees to. Stored with every consent record. Bump it whenever
 * those documents change in substance (and plan a re-consent flow).
 */
export const POLICY_VERSION = "2026-10-08-draft";

/** NIST SP 800-63B: at least 8 characters, no composition rules, long passphrases allowed. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RECOMMENDED_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

/** How long the age and consent answers stay valid while someone finishes signing up. */
export const SIGNUP_TICKET_TTL_MINUTES = 30;

export const SIGNUP_ADULT_COOKIE = "signup_adult";
export const SIGNUP_TICKET_COOKIE = "signup_ticket";
