"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  closeLabel: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** "sheet" slides up from the bottom on phones and centres on larger screens. */
  variant?: "dialog" | "sheet";
  className?: string;
}

/**
 * Built on the native <dialog> element opened with showModal(): the browser
 * makes the rest of the page inert, traps focus, closes on Escape and puts
 * the dialog in the top layer. We only add focus return and light dismiss.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  footer,
  variant = "dialog",
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleClose() {
    onOpenChange(false);
    const target = returnFocusTo.current;
    // Browsers usually restore focus themselves; make sure it never lands on <body>.
    if (target && target.isConnected && document.activeElement !== target) {
      target.focus();
    }
  }

  return (
    // Clicking the backdrop targets the <dialog> itself (its content fills it).
    // Keyboard users close with Escape or the close button, both native.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={cn("ui-dialog", variant === "sheet" && "ui-sheet", className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={handleClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      <div className="ui-dialog__inner">
        {variant === "sheet" ? <span className="ui-sheet__handle" aria-hidden="true" /> : null}
        <div className="ui-dialog__header">
          <h2 className="ui-dialog__title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--icon"
            onClick={() => ref.current?.close()}
          >
            <X aria-hidden="true" />
            <span className="visually-hidden">{closeLabel}</span>
          </button>
        </div>
        {description ? (
          <p className="text-muted" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {children}
        {footer ? <div className="ui-dialog__footer">{footer}</div> : null}
      </div>
    </dialog>
  );
}
