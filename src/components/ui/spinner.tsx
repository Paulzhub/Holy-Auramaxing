import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("ui-spinner", className)} aria-hidden="true" />;
}
