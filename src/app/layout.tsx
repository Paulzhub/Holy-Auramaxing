import type { ReactNode } from "react";

/**
 * The real root layout (with <html> and <body>) is app/[locale]/layout.tsx,
 * so every page knows its language. This pass-through exists so the
 * root-level not-found page has a layout.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
