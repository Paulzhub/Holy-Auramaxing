"use client";

import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type InputHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import type { AuthErrorKey, AuthFormState } from "../form-state";
import type { FieldName } from "../schemas";

/**
 * Lists every problem at the top of the form, linked to its field, and moves
 * focus to the list so screen-reader and keyboard users hear it at once
 * (WCAG 3.3.1, 3.3.3). Field-level messages repeat beside each input.
 */
export function ErrorSummary({
  state,
  fieldIds,
}: {
  state: AuthFormState;
  fieldIds: Partial<Record<FieldName, string>>;
}) {
  const t = useTranslations("auth");
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(state.fieldErrors ?? {}) as [FieldName, AuthErrorKey][];
  const hasErrors = state.status === "error" && (entries.length > 0 || Boolean(state.formError));

  useEffect(() => {
    if (hasErrors) ref.current?.focus();
  }, [state, hasErrors]);

  if (!hasErrors) return null;
  return (
    <div ref={ref} className="auth-error-summary" role="alert" tabIndex={-1} aria-labelledby="error-summary-title">
      <h2 id="error-summary-title" className="auth-error-summary__title">
        <CircleAlert aria-hidden="true" />
        {t("errorSummaryTitle")}
      </h2>
      <ul>
        {state.formError ? <li>{t(`errors.${state.formError}`, state.formErrorValues)}</li> : null}
        {entries.map(([field, key]) => (
          <li key={field}>
            <a href={`#${fieldIds[field] ?? field}`}>{t(`errors.${key}`)}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="ui-error-text" id={id}>
      <CircleAlert aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

export function SubmitButton({ children, pendingLabel }: { children: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} loadingLabel={pendingLabel} className="auth-submit">
      {children}
    </Button>
  );
}

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> {
  id: "current-password" | "new-password";
  label: string;
  hint?: string;
  error?: string;
}

/**
 * A password input with a Show/Hide toggle. Paste and password managers are
 * always allowed; the stable id and autocomplete value tell password
 * managers whether to fill a saved password or suggest a new one.
 */
export function PasswordField({ id, label, hint, error, ...inputProps }: PasswordFieldProps) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="ui-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className="ui-input-wrap auth-password">
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          className="ui-input"
          autoComplete={id}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          {...inputProps}
        />
        <button
          type="button"
          className="auth-password__toggle"
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          <span>{t("showPassword")}</span>
        </button>
      </div>
      {errorId ? <FieldError id={errorId} message={error} /> : null}
    </div>
  );
}

/** The browser's IANA time zone, sent with the consent step so we never have to ask for it. */
export function TimezoneInput() {
  // Empty on the server, the real zone in the browser; it never changes while the page is open.
  const zone = useSyncExternalStore(noopSubscribe, browserTimeZone, () => "");
  return <input type="hidden" name="timezone" value={zone} />;
}

function noopSubscribe() {
  return () => {};
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/** Hidden "next" destination, carried through sign-in. */
export function NextInput({ next }: { next?: string }) {
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

export function useFieldId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}
