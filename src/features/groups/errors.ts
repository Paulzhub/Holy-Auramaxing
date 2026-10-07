import type { GroupErrorKey, GroupField } from "./form-state";

/**
 * The groups functions raise short keys ("group_full", ...); this turns them
 * into message keys under "groups.errors". Unknown errors become "saveFailed".
 */
const fromDatabase: Record<string, GroupErrorKey> = {
  not_signed_in: "signedOut",
  group_not_found: "notFound",
  group_forbidden: "forbidden",
  group_archived: "archived",
  group_full: "full",
  group_already_member: "alreadyMember",
  group_already_requested: "alreadyRequested",
  group_removed: "removed",
  invite_invalid: "inviteInvalid",
  invite_expired: "inviteExpired",
  invite_revoked: "inviteRevoked",
  invite_used_up: "inviteUsedUp",
  email_unverified: "emailUnverified",
  account_closing: "accountClosing",
  covenant_not_accepted: "covenantNotAccepted",
  covenant_changed: "covenantChanged",
  share_level_too_low: "shareLevelTooLow",
  hiding_not_allowed: "hidingNotAllowed",
  owner_must_transfer: "ownerMustTransfer",
  cannot_target_self: "cannotTargetSelf",
  target_not_member: "targetNotMember",
  invalid_input: "invalidInput",
  too_many_groups: "tooManyGroups",
  too_many_invites: "tooManyInvites",
  name_mismatch: "nameMismatch",
  proposal_closed: "proposalClosed",
  max_members_too_low: "maxMembersTooLow",
  start_date_out_of_range: "startDateOutOfRange",
  timezone_invalid: "timezoneInvalid",
};

export function groupErrorKey(error: { message?: string } | null | undefined): GroupErrorKey {
  return (error?.message && fromDatabase[error.message]) || "saveFailed";
}

/** Database errors that belong to one field of the form. */
const fieldOf: Partial<Record<GroupErrorKey, GroupField>> = {
  maxMembersTooLow: "maxMembers",
  startDateOutOfRange: "startDate",
  timezoneInvalid: "timezone",
  shareLevelTooLow: "shareLevel",
  hidingNotAllowed: "leaderboardHidden",
  nameMismatch: "confirmName",
  covenantNotAccepted: "accept",
};

export function errorField(key: GroupErrorKey): GroupField | undefined {
  return fieldOf[key];
}

/** Every key the database can produce, for the message-file test. */
export const databaseErrorKeys = Object.values(fromDatabase);
