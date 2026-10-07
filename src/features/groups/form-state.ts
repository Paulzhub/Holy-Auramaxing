/**
 * What group Server Actions return to their forms. Safe for client code:
 * types and plain values only (no Zod, D-010). Messages are keys under
 * "groups.errors" and are translated in the browser.
 */
import type en from "../../../messages/en.json";

export type GroupErrorKey = keyof (typeof en)["groups"]["errors"];

export type GroupField =
  | "name"
  | "description"
  | "challengeType"
  | "customDays"
  | "startDate"
  | "timezone"
  | "maxMembers"
  | "joinPolicy"
  | "covenant"
  | "minShareLevel"
  | "hidingAllowed"
  | "myShareLevel"
  | "shareLevel"
  | "leaderboardHidden"
  | "expiresInDays"
  | "maxUses"
  | "accept"
  | "covenantSeen"
  | "code"
  | "confirmName";

export interface GroupFormState {
  status: "idle" | "error" | "saved";
  formError?: GroupErrorKey;
  fieldErrors?: Partial<Record<GroupField, GroupErrorKey>>;
  /** What happened, for a status message (e.g. "proposed" for a covenant change). */
  outcome?: string;
}

export const idleGroupFormState: GroupFormState = { status: "idle" };

/** Shown once, right after an invite is made: the secrets are never stored in the clear. */
export interface CreatedInvite {
  link: string;
  code: string;
  qrSvg: string;
  expiresAt: string;
  maxUses: number | null;
}

export interface InviteFormState extends GroupFormState {
  invite?: CreatedInvite;
}
