// @vitest-environment node
import { describe, expect, it } from "vitest";

import { renderSecurityEmail, type SecurityEmailKind } from "./security-alert";

// Words that would reveal what the app is for (CLAUDE.md §7.8). The e2e
// suite checks the same list on emails that arrive in Mailpit.
const sensitive = /porn|lust|relapse|fap|masturbat|addict|streak|sexual|recovery program|temptation/i;

const kinds: SecurityEmailKind[] = ["newSignIn", "recoveryCodeUsed", "passkeyAdded"];

describe("renderSecurityEmail", () => {
  it.each(kinds)("%s is discreet, has a subject, HTML and plain text", async (kind) => {
    const email = await renderSecurityEmail({
      kind,
      device: "Chrome on Windows",
      when: new Date("2026-10-06T05:30:00Z"),
      timeZone: "Asia/Kolkata",
      siteOrigin: "https://aura.example",
    });
    expect(email.subject).toMatch(/Aura/);
    for (const part of [email.subject, email.html, email.text]) expect(part).not.toMatch(sensitive);
    expect(email.html).toContain("Chrome on Windows");
    expect(email.text).toContain("Chrome on Windows");
    expect(email.html).toContain("https://aura.example/settings/security");
    expect(email.html).toContain('lang="en"');
  });

  it("shows the time in the person's own time zone", async () => {
    const email = await renderSecurityEmail({
      kind: "newSignIn",
      device: "Firefox on Linux",
      when: new Date("2026-10-06T05:30:00Z"),
      timeZone: "Asia/Kolkata",
      siteOrigin: "https://aura.example",
    });
    expect(email.text).toMatch(/11:00/);
  });

  it("falls back to UTC for an unknown zone", async () => {
    const email = await renderSecurityEmail({
      kind: "newSignIn",
      device: "Firefox on Linux",
      when: new Date("2026-10-06T05:30:00Z"),
      timeZone: "Not/AZone",
      siteOrigin: "https://aura.example",
    });
    expect(email.text).toMatch(/5:30/);
  });

  it("escapes device text", async () => {
    const email = await renderSecurityEmail({
      kind: "newSignIn",
      device: "<script>x</script>",
      when: new Date(),
      timeZone: "UTC",
      siteOrigin: "https://aura.example",
    });
    expect(email.html).not.toContain("<script>x</script>");
  });
});
