"use client";

import { CircleCheck, Sunrise } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

/**
 * The two large answers (CLAUDE.md §7.5). Plain submit buttons, so the form
 * works without JavaScript; with it, both are held while saving so a double
 * tap can't send twice, and the pressed one says "Saving…". Labels come in
 * as props, so no message namespace is shipped to the browser for this.
 */
export function CheckinChoices({
  cleanLabel,
  slipLabel,
  savingLabel,
  groupLabel,
  current,
}: {
  cleanLabel: string;
  slipLabel: string;
  savingLabel: string;
  groupLabel: string;
  /** The answer already given, when changing it. */
  current?: "clean" | "slipped" | null;
}) {
  const { pending } = useFormStatus();
  const [pressed, setPressed] = useState<"clean" | "slipped" | null>(null);
  const choice = (value: "clean" | "slipped", label: string, icon: ReactNode) => (
    <button
      type="submit"
      name="outcome"
      value={value}
      className={cn("checkin-choice", `checkin-choice--${value}`, current === value && "checkin-choice--current")}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
        else setPressed(value);
      }}
    >
      <span className="checkin-choice__icon" aria-hidden="true">
        {pending && pressed === value ? <Spinner /> : icon}
      </span>
      <span className="checkin-choice__label">{pending && pressed === value ? savingLabel : label}</span>
    </button>
  );
  return (
    <div className="checkin-choices" role="group" aria-label={groupLabel}>
      {choice("clean", cleanLabel, <CircleCheck />)}
      {choice("slipped", slipLabel, <Sunrise />)}
    </div>
  );
}
