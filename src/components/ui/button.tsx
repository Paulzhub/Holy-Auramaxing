"use client";

import type { VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";

import { cn } from "@/lib/cn";

import { buttonVariants } from "./button-variants";
import type { PreviewState } from "./preview";
import { Spinner } from "./spinner";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Shows a spinner, keeps the button focusable and blocks activation. */
  loading?: boolean;
  /** Screen-reader text announced with the button while loading. */
  loadingLabel?: string;
  preview?: PreviewState;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Disabled buttons use aria-disabled rather than the disabled attribute so
 * they stay in the tab order and screen-reader users can learn why.
 */
export function Button({
  variant,
  size,
  loading = false,
  loadingLabel,
  preview,
  disabled,
  className,
  children,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  const inactive = Boolean(disabled) || loading;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (inactive) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      data-preview={preview}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
      {loading && loadingLabel ? <span className="visually-hidden">{loadingLabel}</span> : null}
    </button>
  );
}
