import type { AuthErrorKey } from "./form-state";

/**
 * Shapes returned by the two-step and passkey Server Actions. No Zod here:
 * client components import this file (D-010).
 */
export const PASSKEY_NAME_MAX_LENGTH = 60;

/** Setting up the authenticator app: start → scan and confirm → save recovery codes. */
export interface TwoStepSetupState {
  status: "idle" | "scanning" | "codes" | "error";
  error?: AuthErrorKey;
  /** While scanning: the unverified factor, its QR code (an SVG data URI) and the key to type in. */
  factorId?: string;
  qrCode?: string;
  secret?: string;
  /** Shown once, formatted "xxxxx-xxxxx". */
  recoveryCodes?: string[];
}

export const initialTwoStepSetupState: TwoStepSetupState = { status: "idle" };

export interface RecoveryCodesState {
  status: "idle" | "codes" | "error";
  error?: AuthErrorKey;
  recoveryCodes?: string[];
}

export const initialRecoveryCodesState: RecoveryCodesState = { status: "idle" };

/** The browser half of a passkey ceremony. */
export type PasskeyStartResult =
  | { ok: true; challengeId: string; options: Record<string, unknown> }
  | { ok: false; error: AuthErrorKey; retryAfterMinutes?: number };

export type PasskeyFinishResult = { ok: true; redirectTo: string } | { ok: false; error: AuthErrorKey };
