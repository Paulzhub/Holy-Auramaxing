"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { SHARE_LEVELS, shareRank, type ShareLevel } from "../constants";
import type { GroupField, GroupFormState } from "../form-state";

/** Shared pieces of the group forms. Messages are under "groups". */

export function useGroupErrors(state: GroupFormState) {
  const t = useTranslations("groups");
  return (field: GroupField) => {
    const key = state.fieldErrors?.[field];
    return key ? t(`errors.${key}`) : undefined;
  };
}

export function ErrorSummary({
  state,
  order,
  id,
}: {
  state: GroupFormState;
  order: readonly GroupField[];
  id: string;
}) {
  const t = useTranslations("groups");
  const ref = useRef<HTMLDivElement>(null);
  const entries = order.flatMap((f) => (state.fieldErrors?.[f] ? [[f, state.fieldErrors[f]!] as const] : []));
  const hasErrors = state.status === "error" && (entries.length > 0 || Boolean(state.formError));

  useEffect(() => {
    if (hasErrors) ref.current?.focus();
  }, [state, hasErrors]);

  if (!hasErrors) return null;
  return (
    <div ref={ref} className="auth-error-summary" role="alert" tabIndex={-1} aria-labelledby={`${id}-error-title`}>
      <h2 id={`${id}-error-title`} className="auth-error-summary__title">
        <CircleAlert aria-hidden="true" />
        {t("errors.errorSummaryTitle")}
      </h2>
      <ul>
        {state.formError ? <li>{t(`errors.${state.formError}`)}</li> : null}
        {entries.map(([field, key]) => (
          <li key={field}>
            <a href={`#${id}-${field}`}>{t(`errors.${key}`)}</a>
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

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function TextArea({
  id,
  name,
  label,
  hint,
  error,
  maxLength,
  defaultValue,
  rows,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  maxLength: number;
  defaultValue: string;
  rows: number;
}) {
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="ui-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        name={name}
        className="ui-input onboarding-textarea"
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function Select({
  id,
  name,
  label,
  hint,
  options,
  defaultValue,
  error,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  defaultValue: string;
  error?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="ui-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <select
        id={id}
        name={name}
        className="ui-input"
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function Checkbox({
  id,
  name,
  label,
  hint,
  defaultChecked,
  error,
  required,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="ui-field">
      <div className="auth-check">
        <input
          type="checkbox"
          id={id}
          name={name}
          defaultChecked={defaultChecked}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      {hint ? (
        <p className="ui-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/**
 * Share levels as radio cards with a plain description each. Levels under
 * `min` aren't offered: a member may share more than the covenant's
 * minimum, never less (D-027).
 */
export function ShareLevelChoice({
  id,
  name,
  legend,
  hint,
  min = "checkin_only",
  defaultValue,
  error,
  onChange,
}: {
  id: string;
  name: string;
  legend: string;
  hint?: string;
  min?: ShareLevel;
  defaultValue: ShareLevel;
  error?: string;
  onChange?: (value: ShareLevel) => void;
}) {
  const t = useTranslations("groups.shareLevels");
  const levels = SHARE_LEVELS.filter((l) => shareRank(l) >= shareRank(min));
  return (
    <fieldset
      className="group-choice"
      id={id}
      aria-describedby={describedBy(id, hint, error)}
      aria-invalid={error ? true : undefined}
    >
      <legend className="ui-label">{legend}</legend>
      {hint ? (
        <p className="ui-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {levels.map((level) => (
        <div key={level} className="group-choice__option">
          <input
            type="radio"
            id={`${id}-${level}`}
            name={name}
            value={level}
            defaultChecked={level === (shareRank(defaultValue) >= shareRank(min) ? defaultValue : min)}
            aria-describedby={`${id}-${level}-desc`}
            onChange={onChange ? () => onChange(level) : undefined}
          />
          <label htmlFor={`${id}-${level}`}>
            <span className="group-choice__label">{t(`${level}.label`)}</span>
            <span className="group-choice__desc" id={`${id}-${level}-desc`}>
              {t(`${level}.description`)}
            </span>
          </label>
        </div>
      ))}
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  );
}

export function SubmitButton({
  label,
  pendingLabel,
  children,
}: {
  label: string;
  pendingLabel: string;
  children?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel={pendingLabel}>
      {children}
      {label}
    </Button>
  );
}

/** A polite "Saved." after a successful save. */
export function SavedStatus({ message }: { message?: string }) {
  return (
    <p className="group-status" role="status">
      {message}
    </p>
  );
}
