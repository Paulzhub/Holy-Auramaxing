import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";

import en from "../../messages/en.json";

/**
 * A notification email (CLAUDE.md §7.8, D-092): sender "Holy Auramaxing", a
 * neutral subject, one discreet line, a button into the app, and one-click
 * unsubscribe for this type (the link here, and List-Unsubscribe headers
 * added by the sender). Server-only.
 */

/** A notification email's words (built in features/notifications/outbound.ts). */
export interface EmailWords {
  subject: string;
  preview: string;
  heading: string;
  line: string;
  why: string;
  open: string;
  unsubscribe: string;
  settings: string;
  /** A path inside the app. */
  url: string;
}

const colors = { page: "#f5f3fa", card: "#ffffff", ink: "#1e1b3a", muted: "#5b5878", accent: "#4a3fb5" };

function NotificationEmail({
  words,
  links,
}: {
  words: EmailWords;
  links: { open: string; unsubscribe: string; settings: string };
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{words.preview}</Preview>
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
          <Text style={{ margin: "0 0 8px", fontSize: "14px", color: colors.muted }}>{en.emails.brand}</Text>
          <Heading as="h1" style={{ margin: "0 0 16px", fontSize: "22px" }}>
            {words.heading}
          </Heading>
          <Text style={{ margin: "0 0 24px", fontSize: "16px", lineHeight: "1.5" }}>{words.line}</Text>
          <Section style={{ margin: "0 0 24px" }}>
            <Button
              href={links.open}
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
              {words.open}
            </Button>
          </Section>
          <Text style={{ margin: "0 0 8px", fontSize: "14px", lineHeight: "1.5", color: colors.muted }}>
            {words.why}
          </Text>
          <Text style={{ margin: 0, fontSize: "14px", lineHeight: "1.5" }}>
            <a href={links.unsubscribe} style={{ color: colors.accent }}>
              {words.unsubscribe}
            </a>
            {" · "}
            <a href={links.settings} style={{ color: colors.accent }}>
              {words.settings}
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderNotificationEmail(
  words: EmailWords,
  links: { open: string; unsubscribe: string; settings: string },
): Promise<{ subject: string; html: string; text: string }> {
  const element = <NotificationEmail words={words} links={links} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: words.subject, html, text };
}
