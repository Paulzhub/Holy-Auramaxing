// @vitest-environment node
import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  formatInviteCode,
  generateInviteCode,
  generateInviteToken,
  hashInviteCode,
  hashInviteToken,
  inviteLink,
  isInviteToken,
  normaliseInviteCode,
} from "./invite-secrets";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");
});

describe("invite link tokens", () => {
  it("carry 160 random bits, URL-safe", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateInviteToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(isInviteToken(token)).toBe(true);
      expect(Buffer.from(token, "base64url")).toHaveLength(20);
    }
  });

  it("are stored as SHA-256 hex, never as themselves", () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashInviteToken(token)).toBe(hash);
  });

  it("reject anything that isn't a token", () => {
    for (const bad of ["", "short", "a".repeat(28), "has spaces in it padding xx", "../../../etc/passwd/xxxxxxx"]) {
      expect(isInviteToken(bad)).toBe(false);
    }
  });

  it("build a /join link", () => {
    expect(inviteLink("https://aura.example", "abc")).toBe("https://aura.example/join/abc");
  });
});

describe("invite short codes", () => {
  it("are 10 Crockford characters, shown in two groups of five", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/);
    expect(formatInviteCode("abcde12345")).toBe("ABCDE-12345");
  });

  it("accept what people type: case, spaces, dashes and look-alike letters", () => {
    expect(normaliseInviteCode("ABCDE-12345")).toBe("abcde12345");
    expect(normaliseInviteCode(" abcde 12345 ")).toBe("abcde12345");
    expect(normaliseInviteCode("OIL0012345")).toBe("0110012345");
    expect(normaliseInviteCode("abcde1234")).toBeNull();
    expect(normaliseInviteCode("abcde-1234u")).toBeNull();
  });

  it("are stored as a keyed hash, so the database alone can't check a guess", () => {
    const hash = hashInviteCode("abcde12345");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(hashInviteToken("abcde12345"));
    expect(hashInviteCode("abcde12345")).toBe(hash);
  });
});
