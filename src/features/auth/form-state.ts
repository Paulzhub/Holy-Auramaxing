import type { FieldName } from "./schemas";

/**
 * What a Server Action returns to its form. Messages are keys under
 * "auth.errors" / "auth.notices" and are translated in the browser.
 */
export interface AuthFormState {
  status: "idle" | "error" | "sent";
  /** A message about the whole form. */
  formError?: string;
  /** Interpolation values for formError (e.g. seconds to wait). */
  formErrorValues?: Record<string, string | number>;
  fieldErrors?: Partial<Record<FieldName, string>>;
  /** Echo of the email typed, so the field keeps its value after an error. Never the password. */
  email?: string;
  /** Neutral confirmation shown after sending an email. */
  notice?: string;
}

export const initialAuthFormState: AuthFormState = { status: "idle" };
