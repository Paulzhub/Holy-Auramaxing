// Sends one test email with the SMTP settings in .env.local (D-031), so you
// can check a Gmail app password before relying on it.
//
//   npm run email:test -- you@example.com
//
// Prints only whether it worked; never the password.
import { existsSync, readFileSync } from "node:fs";

import nextEnv from "@next/env";
import { createTransport } from "nodemailer";

nextEnv.loadEnvConfig(process.cwd());

const to = process.argv[2];
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = process.env;

if (!to || !/^[^@\s]+@[^@\s]+$/.test(to)) {
  console.error("Usage: npm run email:test -- you@example.com");
  process.exit(1);
}
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
  console.error("Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in .env.local first (see .env.example).");
  // A common slip: "SMTP_USER: x" instead of "SMTP_USER=x"; such lines are ignored.
  const colon = existsSync(".env.local")
    ? readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((line) => /^SMTP_[A-Z_]+\s*:/.test(line))
        .map((line) => line.split(":")[0].trim())
    : [];
  if (colon.length) console.error(`In .env.local, use "=" not ":" on these lines: ${colon.join(", ")}`);
  process.exit(1);
}

const port = Number(SMTP_PORT || 465);
const transporter = createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465,
  requireTLS: port !== 465,
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  connectionTimeout: 10_000,
});

try {
  await transporter.verify();
  const info = await transporter.sendMail({
    from: EMAIL_FROM || `Holy Auramaxing <${SMTP_USER}>`,
    to,
    subject: "Holy Auramaxing test email",
    text: "This is a test from your Holy Auramaxing app. If you can read it, email is set up.",
  });
  console.log(`Sent to ${to} through ${SMTP_HOST}:${port} (${info.messageId}). Check the inbox and the spam folder.`);
} catch (error) {
  console.error(`Couldn't send through ${SMTP_HOST}:${port}: ${error instanceof Error ? error.message : error}`);
  if (/535|Username and Password/i.test(String(error))) {
    console.error(
      "Gmail refused the login: use an app password (Google account → Security → App passwords), not the account password.",
    );
  }
  process.exit(1);
}
