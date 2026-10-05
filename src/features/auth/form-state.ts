import type en from "../../../messages/en.json";

import type { FieldName } from "./schemas";

/** Keys under "auth.errors" and "auth.notices" in messages/en.json. */
export type AuthErrorKey = keyof (typeof en)["auth"]["errors"];
export type AuthNoticeKey = keyof (typeof en)["auth"]["notices"];

/**
 * What a Server Action returns to its form. Messages are keys under
 * "auth.errors" / "auth.notices" and are translated in the browser.
 */
export interface AuthFormState {
  status: "idle" | "error" | "sent";
  /** A message about the whole form. */
  formError?: AuthErrorKey;
  /** Interpolation values for formError (e.g. minutes to wait). */
  formErrorValues?: Record<string, number>;
  fieldErrors?: Partial<Record<FieldName, AuthErrorKey>>;
  /** Echo of the email typed, so the field keeps its value after an error. Never the password. */
  email?: string;
  /** Neutral confirmation shown after sending an email. */
  notice?: AuthNoticeKey;
}

export const initialAuthFormState: AuthFormState = { status: "idle" };
