import type { ReactNode } from "react";

import { PublicFrame } from "@/features/marketing";

/** The public website (CLAUDE.md §12, D-114). Indexing is decided per page. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}
