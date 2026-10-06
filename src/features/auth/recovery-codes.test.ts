// @vitest-environment node
import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  formatRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normaliseRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "./recovery-codes";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");
});

describe("recovery codes", () => {
  it("generates ten distinct, well-formed codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/);
      expect(normaliseRecoveryCode(code)).toBe(code);
    }
  });

  it("accepts what people type: case, spaces, dashes and look-alike letters", () => {
    expect(normaliseRecoveryCode("ABCDE-12345")).toBe("abcde12345");
    expect(normaliseRecoveryCode(" abcde 12345 ")).toBe("abcde12345");
    expect(normaliseRecoveryCode("abcdeO1I45")).toBe("abcde01145");
    expect(formatRecoveryCode("abcde12345")).toBe("abcde-12345");
  });

  it("rejects anything that can't be a code", () => {
    expect(normaliseRecoveryCode("short")).toBeNull();
    expect(normaliseRecoveryCode("abcde-1234u")).toBeNull();
    expect(normaliseRecoveryCode("")).toBeNull();
  });

  it("hashes per person, with a secret key", () => {
    const a = hashRecoveryCode("user-a", "abcde12345");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode("user-a", "abcde12345")).toBe(a);
    expect(hashRecoveryCode("user-b", "abcde12345")).not.toBe(a);
  });
});
