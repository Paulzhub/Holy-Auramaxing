import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { PreviewState } from "./preview";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "li";
  tone?: "default" | "error";
  preview?: PreviewState;
  children: ReactNode;
}

export function Card({ as: Tag = "div", tone = "default", preview, className, children, ...rest }: CardProps) {
  return (
    <Tag className={cn("ui-card", tone === "error" && "ui-card--error", className)} data-preview={preview} {...rest}>
      {children}
    </Tag>
  );
}

export function CardTitle({
  as: Tag = "h3",
  className,
  children,
  id,
}: {
  as?: "h2" | "h3" | "h4";
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Tag className={cn("ui-card__title", className)} id={id}>
      {children}
    </Tag>
  );
}
