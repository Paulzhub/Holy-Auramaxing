"use client";

import { useEffect } from "react";

/**
 * Moves focus (and the view) to a heading after a form comes back to the
 * same page. The address can't carry a `#fragment` for this on pages where
 * the fragment itself would say too much (privacy review 2, D-098), so the
 * page renders this only when it has a result to show. Without JavaScript
 * the result is still on the page; the visitor just starts at the top.
 */
export function FocusOnArrival({ targetId }: { targetId: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  }, [targetId]);
  return null;
}
