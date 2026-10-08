import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthFrame } from "../_frames/auth-frame";

// Sign-in and sign-up pages: useful to nobody in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>;
}
