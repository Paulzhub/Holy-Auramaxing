/**
 * What the wall's Server Actions return to their forms. Safe for client code:
 * types and plain values only (no Zod, D-010). Messages are keys under
 * "social.errors" and are translated in the browser.
 */
import type en from "../../../messages/en.json";

export type SocialErrorKey = keyof (typeof en)["social"]["errors"];

export interface SocialFormState {
  status: "idle" | "error" | "saved";
  error?: SocialErrorKey;
  /** The typed text, put back after an error so nobody types it twice. */
  body?: string;
  kind?: string;
  /** Bumped on each success, so a form can clear itself and announce it. */
  savedAt?: number;
}

export const idleSocialFormState: SocialFormState = { status: "idle" };
