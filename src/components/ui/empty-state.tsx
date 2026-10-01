import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
}

/** An invitation to act, not a dead end. */
export function EmptyState({ icon, title, body, action, headingLevel: Heading = "h2", className }: EmptyStateProps) {
  return (
    <div className={cn("ui-empty", className)}>
      <span className="ui-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <Heading className="ui-empty__title">{title}</Heading>
      <p className="ui-empty__body">{body}</p>
      {action}
    </div>
  );
}
