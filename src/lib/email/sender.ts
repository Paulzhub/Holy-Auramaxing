import { createTransport, type Transporter } from "nodemailer";

import { readServerEnv, type ServerEnv } from "@/lib/env";
import { devLog } from "@/lib/server/dev-log";

/**
 * Sends the app's own emails (D-030). Supabase sends the Auth emails
 * (confirmations, links, password-changed notices) itself; this is for
 * everything else, starting with security alerts.
 *
 *  - resend:  production, through Resend's HTTP API (one fetch, no SDK).
 *  - smtp:    any SMTP server, e.g. a dedicated Gmail account with an app
 *             password while there's no sending domain (D-031).
 *  - mailpit: local development and tests, into the Mailpit inbox that
 *             `supabase start` runs.
 *  - none:    nothing is sent (a development log line explains why).
 *
 * Never log addresses or message bodies.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  readonly name: "resend" | "smtp" | "mailpit" | "none";
  send(message: EmailMessage): Promise<void>;
}

const DEFAULT_RESEND_FROM = "Holy Auramaxing <onboarding@resend.dev>";
const DEFAULT_LOCAL_FROM = "Holy Auramaxing <no-reply@holy-auramaxing.localhost>";
const TIMEOUT_MS = 5000;

/** "Name <address>" → parts; a bare address keeps the name "Holy Auramaxing". */
export function parseFrom(from: string): { name: string; email: string } {
  const match = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from);
  if (match) return { name: match[1] || "Holy Auramaxing", email: match[2]! };
  return { name: "Holy Auramaxing", email: from.trim() };
}

class ResendSender implements EmailSender {
  readonly name = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}

export interface SmtpSettings {
  host: string;
  /** 465: TLS from the start. Anything else (587): STARTTLS, which is required. */
  port: number;
  user: string;
  password: string;
  from: string;
}

class SmtpSender implements EmailSender {
  readonly name = "smtp" as const;
  private transporter: Transporter | undefined;

  constructor(private readonly settings: SmtpSettings) {}

  async send(message: EmailMessage) {
    const { host, port, user, password, from } = this.settings;
    this.transporter ??= createTransport({
      host,
      port,
      secure: port === 465,
      // On 587, refuse to send unless the connection is upgraded to TLS.
      requireTLS: port !== 465,
      auth: { user, pass: password },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS * 2,
    });
    await this.transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}

class MailpitSender implements EmailSender {
  readonly name = "mailpit" as const;
  constructor(
    private readonly baseUrl: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    const from = parseFrom(this.from);
    const res = await fetch(new URL("/api/v1/send", this.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: from.email, Name: from.name },
        To: [{ Email: message.to }],
        Subject: message.subject,
        HTML: message.html,
        Text: message.text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Mailpit responded ${res.status}`);
  }
}

class NoSender implements EmailSender {
  readonly name = "none" as const;
  async send() {
    devLog(
      "email",
      "No email provider is configured (EMAIL_PROVIDER / RESEND_API_KEY / SMTP_* / MAILPIT_URL); not sent.",
    );
  }
}

/** Picks the sender from configuration. Exported for tests. */
export function selectSender(env: ServerEnv): EmailSender {
  const provider =
    env.EMAIL_PROVIDER ??
    (env.RESEND_API_KEY ? "resend" : env.SMTP_HOST ? "smtp" : env.MAILPIT_URL ? "mailpit" : "none");
  if (provider === "smtp") {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) return new NoSender();
    return new SmtpSender({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 465,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      // Gmail sends only as the signed-in account, so that address is the default.
      from: env.EMAIL_FROM ?? `Holy Auramaxing <${env.SMTP_USER}>`,
    });
  }
  if (provider === "resend") {
    if (!env.RESEND_API_KEY) return new NoSender();
    return new ResendSender(env.RESEND_API_KEY, env.EMAIL_FROM ?? DEFAULT_RESEND_FROM);
  }
  if (provider === "mailpit") {
    if (!env.MAILPIT_URL) return new NoSender();
    return new MailpitSender(env.MAILPIT_URL, env.EMAIL_FROM ?? DEFAULT_LOCAL_FROM);
  }
  return new NoSender();
}

let sender: EmailSender | undefined;

function getSender(): EmailSender {
  sender ??= selectSender(readServerEnv());
  return sender;
}

/**
 * Sends one email. Returns false instead of throwing: a missed alert must
 * never break the request that caused it. Call it inside after() so the
 * person never waits for it (Phase 7's job queue takes over).
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  try {
    await getSender().send(message);
    return true;
  } catch (error) {
    devLog("email", error);
    return false;
  }
}
