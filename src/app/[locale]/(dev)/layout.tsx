import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { clientMessages } from "@/i18n/client-messages";
import { getThemePreference } from "@/lib/server/theme";

// The component gallery uses the app shell but needs no account
// (it is off in production unless ENABLE_DEV_PAGES=true).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function DevLayout({ children }: { children: ReactNode }) {
  const theme = await getThemePreference();
  const messages = await clientMessages(["dev"]);
  return (
    <NextIntlClientProvider messages={messages}>
      <AppShell theme={theme}>{children}</AppShell>
    </NextIntlClientProvider>
  );
}
