import { CircleAlert } from "lucide-react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import type { PreviewState } from "./preview";
import { Spinner } from "./spinner";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  /** Shown below the input and announced; also sets aria-invalid. */
  error?: string;
  /** For async checks such as "is this handle free?". */
  loading?: boolean;
  loadingLabel?: string;
  preview?: PreviewState;
}

export function TextField({
  id,
  label,
  hint,
  error,
  loading = false,
  loadingLabel,
  preview,
  className,
  ...inputProps
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("ui-field", className)}>
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="ui-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className="ui-input-wrap" aria-busy={loading || undefined}>
        <input
          id={id}
          className="ui-input"
          data-preview={preview}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {loading ? <Spinner /> : null}
      </div>
      {/* The live region is always there, so screen readers notice when the words arrive (WCAG 4.1.3). */}
      {loadingLabel !== undefined ? (
        <p className="visually-hidden" role="status">
          {loading ? loadingLabel : ""}
        </p>
      ) : null}
      {error ? (
        <p className="ui-error-text" id={errorId}>
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
