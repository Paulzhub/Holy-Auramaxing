import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { routing } from "@/i18n/routing";
import { getThemePreference } from "@/lib/server/theme";
import { colorSchemeContent, themeAttribute, themeBootScript } from "@/lib/theme/theme";

import { display, sans } from "../fonts";
import "../globals.css";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const requested = (await params).locale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const tApp = await getTranslations({ locale, namespace: "app" });
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const tabName = tApp("tabName");

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    // Tab titles use the short, neutral name so a glance at a browser tab reveals nothing.
    title: { default: tabName, template: tMeta("titleTemplate", { page: "%s", app: tabName }) },
    description: tApp("description"),
    applicationName: tabName,
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getThemePreference();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    colorScheme: colorSchemeContent(theme) as Viewport["colorScheme"],
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#f5f3fa" },
      { media: "(prefers-color-scheme: dark)", color: "#13112b" },
    ],
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const theme = await getThemePreference();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      dir="ltr"
      data-theme={themeAttribute(theme)}
      className={`${display.variable} ${sans.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before first paint; see src/lib/theme/theme.ts. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
