// @vitest-environment node
import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { decryptText, encryptText } from "./encryption";

describe("encryptText / decryptText", () => {
  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips text, including emoji and other scripts", () => {
    const secret = "For my family 🙏 और मेरे भविष्य के लिए";
    const stored = encryptText(secret, "user-1");
    expect(stored).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]*$/);
    expect(stored).not.toContain("family");
    expect(decryptText(stored, "user-1")).toBe(secret);
  });

  it("never produces the same output twice (random IV)", () => {
    expect(encryptText("same", "u")).not.toBe(encryptText("same", "u"));
  });

  it("detects tampering", () => {
    const stored = encryptText("hello", "u");
    const parts = stored.split(":");
    const flipped = Buffer.from(parts[3]!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    parts[3] = flipped.toString("base64url");
    expect(() => decryptText(parts.join(":"), "u")).toThrow();
  });

  // Security review 1, finding SR-5 (D-054): GCM tags shorter than 16 bytes
  // make forgery far cheaper; Node accepts them unless told the length.
  it("refuses a truncated authentication tag", () => {
    const stored = encryptText("hello", "u");
    const parts = stored.split(":");
    parts[2] = Buffer.from(parts[2]!, "base64url").subarray(0, 4).toString("base64url");
    expect(() => decryptText(parts.join(":"), "u")).toThrow();
  });

  it("refuses a value copied onto another user's row", () => {
    const stored = encryptText("mine", "user-a");
    expect(() => decryptText(stored, "user-b")).toThrow();
  });

  it("refuses to run without a proper key", () => {
    const saved = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = "too-short";
    expect(() => encryptText("x", "u")).toThrow(/32 bytes/);
    process.env.APP_ENCRYPTION_KEY = saved;
  });
});
