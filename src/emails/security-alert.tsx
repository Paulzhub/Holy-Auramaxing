import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { createTranslator } from "next-intl";

import en from "../../messages/en.json";

/**
 * Security alerts the app sends itself (D-030). Supabase sends the
 * password-changed and two-step on/off notices from supabase/templates.
 *
 * Discreet by design (CLAUDE.md §7.8): sender "Aura", neutral subjects, and
 * nothing that says what the app is for. Server-only.
 */
export type SecurityEmailKind = "newSignIn" | "recoveryCodeUsed" | "passkeyAdded";

export interface SecurityEmailInput {
  kind: SecurityEmailKind;
  /** Coarse device, e.g. "Chrome on Windows". */
  device: string;
  when: Date;
  /** The person's IANA time zone, for the time shown. */
  timeZone: string;
  siteOrigin: string;
  locale?: "en";
}

const colors = { page: "#f5f3fa", card: "#ffffff", ink: "#1e1b3a", muted: "#5b5878", accent: "#4a3fb5" };

const actions: Record<SecurityEmailKind, { primary: string; secondary?: string }> = {
  newSignIn: { primary: "/settings/security", secondary: "/forgot-password" },
  recoveryCodeUsed: { primary: "/settings/security", secondary: "/forgot-password" },
  passkeyAdded: { primary: "/settings/security", secondary: "/forgot-password" },
};

function formatWhen(when: Date, timeZone: string, locale: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(when);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(when);
  }
}

function SecurityAlert({ input }: { input: SecurityEmailInput }) {
  const locale = input.locale ?? "en";
  const t = createTranslator({ locale, messages: en, namespace: "emails" });
  const values = { device: input.device, when: formatWhen(input.when, input.timeZone, locale) };
  const link = (path: string) => new URL(path, input.siteOrigin).toString();
  const { primary, secondary } = actions[input.kind];

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{t(`${input.kind}.preview`)}</Preview>
      <Body
        style={{
          margin: 0,
          padding: "24px",
          background: colors.page,
          fontFamily: "Arial, Helvetica, sans-serif",
          color: colors.ink,
        }}
      >
        <Container
          style={{
            maxWidth: "480px",
            margin: "0 auto",
            background: colors.card,
            borderRadius: "12px",
            padding: "32px",
          }}
        >
          <Text style={{ margin: "0 0 8px", fontSize: "14px", color: colors.muted }}>{t("brand")}</Text>
          <Heading as="h1" style={{ margin: "0 0 16px", fontSize: "22px" }}>
            {t(`${input.kind}.heading`)}
          </Heading>
          <Text style={{ margin: "0 0 16px", fontSize: "16px", lineHeight: "1.5" }}>
            {t(`${input.kind}.body`, values)}
          </Text>
          <Text style={{ margin: "0 0 24px", fontSize: "16px", lineHeight: "1.5" }}>{t(`${input.kind}.ifNotYou`)}</Text>
          <Section style={{ margin: "0 0 16px" }}>
            <Button
              href={link(primary)}
              style={{
                display: "inline-block",
                padding: "12px 20px",
                background: colors.accent,
                color: "#ffffff",
                textDecoration: "none",
                borderRadius: "8px",
                fontSize: "16px",
              }}
            >
              {t(`${input.kind}.primary`)}
            </Button>
          </Section>
          {secondary ? (
            <Text style={{ margin: "0 0 24px", fontSize: "16px" }}>
              <a href={link(secondary)} style={{ color: colors.accent }}>
                {t(`${input.kind}.secondary`)}
              </a>
            </Text>
          ) : null}
          <Text style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: colors.muted }}>{t("footer")}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderSecurityEmail(
  input: SecurityEmailInput,
): Promise<{ subject: string; html: string; text: string }> {
  const t = createTranslator({ locale: input.locale ?? "en", messages: en, namespace: "emails" });
  const element = <SecurityAlert input={input} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: t(`${input.kind}.subject`), html, text };
}
