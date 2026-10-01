import { describe, expect, it } from "vitest";

import { allowedStyleAttributeHashes, buildCsp, createNonce } from "./csp";

function directive(csp: string, name: string): string {
  return csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
}

describe("createNonce", () => {
  it("is 128-bit base64 and unique per call", () => {
    const nonces = new Set(Array.from({ length: 200 }, createNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) expect(Buffer.from(nonce, "base64")).toHaveLength(16);
  });
});

describe("buildCsp (production)", () => {
  const csp = buildCsp({
    nonce: "abc123",
    isDev: false,
    upgradeInsecure: true,
    supabaseUrl: "https://xyz.supabase.co",
  });

  it("only runs scripts carrying this request's nonce", () => {
    const scripts = directive(csp, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
  });

  it("nonces style elements and allows only reviewed style attributes", () => {
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'nonce-abc123'");
    expect(directive(csp, "style-src-attr")).toBe(
      `style-src-attr 'unsafe-hashes' ${allowedStyleAttributeHashes.join(" ")}`,
    );
  });

  it("blocks framing, plugins and base-tag hijacking", () => {
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
  });

  it("allows the Supabase project for fetch and realtime only", () => {
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co");
    expect(directive(csp, "script-src")).not.toContain("supabase");
  });

  it("upgrades insecure requests on HTTPS", () => {
    expect(csp).toContain("upgrade-insecure-requests");
  });
});

describe("buildCsp (development)", () => {
  const csp = buildCsp({ nonce: "n", isDev: true, upgradeInsecure: false });

  it("relaxes only what the dev server needs", () => {
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
