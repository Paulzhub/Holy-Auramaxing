"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Unread notification counts for the shell: the Alerts item in the
 * navigation (the bell) and the group switcher read them; the live client
 * updates them after a ping (CLAUDE.md §7.8, D-089). The server renders the
 * first numbers, so the counts show without JavaScript too.
 */

export interface AlertCounts {
  total: number;
  byGroup: Record<string, number>;
}

interface AlertCountsValue extends AlertCounts {
  set: (counts: AlertCounts) => void;
}

const AlertCountsContext = createContext<AlertCountsValue | null>(null);

export function AlertCountsProvider({ initial, children }: { initial: AlertCounts; children: ReactNode }) {
  const [counts, setCounts] = useState<AlertCounts>(initial);
  // A new server render (a navigation, a refresh) brings fresh numbers.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCounts(initial);
  }
  const value = useMemo(() => ({ ...counts, set: setCounts }), [counts]);
  return <AlertCountsContext.Provider value={value}>{children}</AlertCountsContext.Provider>;
}

/** The current counts; zero outside the app shell. */
export function useAlertCounts(): AlertCountsValue {
  return useContext(AlertCountsContext) ?? { total: 0, byGroup: {}, set: () => {} };
}

/** "99+" past 99. */
export function countLabel(n: number): string {
  return n > 99 ? "99+" : String(n);
}
