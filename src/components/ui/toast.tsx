"use client";

import { CircleAlert, CircleCheckBig, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastItem extends Required<Pick<ToastInput, "title" | "tone">> {
  id: number;
  description?: string;
}

interface ToastContextValue {
  show: (toast: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toasts never leave on a timer (WCAG 2.2.1, D-060): each stays until it is
 * dismissed or pushed out by newer ones, so nobody has to read against a clock.
 */
const MAX_TOASTS = 3;

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

export function ToastProvider({
  children,
  regionLabel,
  dismissLabel,
}: {
  children: ReactNode;
  regionLabel: string;
  dismissLabel: string;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((items) => [
      ...items.slice(-(MAX_TOASTS - 1)),
      { id, title: toast.title, description: toast.description, tone: toast.tone ?? "info" },
    ]);
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* The live region exists before any toast is added, so additions are announced. */}
      <div className="ui-toast-region" role="region" aria-label={regionLabel}>
        <ol aria-live="polite" aria-relevant="additions text">
          {toasts.map((toast) => (
            <ToastView key={toast.id} toast={toast} dismissLabel={dismissLabel} onDismiss={dismiss} />
          ))}
        </ol>
      </div>
    </ToastContext.Provider>
  );
}

const icons = { info: Info, success: CircleCheckBig, error: CircleAlert } as const;

export function ToastView({
  toast,
  dismissLabel,
  onDismiss,
  announce = true,
}: {
  toast: Omit<ToastItem, "id"> & { id?: number };
  dismissLabel: string;
  onDismiss?: (id: number) => void;
  /** False for static previews, so they are not exposed as alerts. */
  announce?: boolean;
}) {
  const Icon = icons[toast.tone];
  const { id, tone } = toast;

  return (
    <li>
      {/* Errors are announced assertively; others via the region's polite live setting. */}
      <div className={cn("ui-toast", `ui-toast--${tone}`)} role={announce && tone === "error" ? "alert" : undefined}>
        <Icon className="ui-toast__icon" aria-hidden="true" />
        <div className="ui-toast__body">
          <p className="ui-toast__title">{toast.title}</p>
          {toast.description ? <p className="ui-toast__description">{toast.description}</p> : null}
        </div>
        {onDismiss && id !== undefined ? (
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--icon ui-button--sm"
            onClick={() => onDismiss(id)}
          >
            <X aria-hidden="true" />
            <span className="visually-hidden">{dismissLabel}</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}
