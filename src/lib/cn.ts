import { clsx, type ClassValue } from "clsx";

/**
 * Join class names. Components are styled with CSS classes (src/styles), so
 * Tailwind-conflict merging isn't needed and its ~7 KB stays out of the bundle.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
