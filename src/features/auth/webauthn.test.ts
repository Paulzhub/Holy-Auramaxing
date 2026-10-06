import { describe, expect, it } from "vitest";

import { ceremonyError, toBase64url, toBytes } from "./webauthn";

describe("webauthn helpers", () => {
  it("round-trips base64url without padding", () => {
    for (const length of [0, 1, 2, 3, 16, 31, 32]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 250) % 256);
      const encoded = toBase64url(bytes);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(new Uint8Array(toBytes(encoded))).toEqual(bytes);
    }
  });

  it("treats a dismissed or timed-out prompt as cancelled", () => {
    expect(ceremonyError(new DOMException("x", "NotAllowedError"))).toBe("passkeyCancelled");
    expect(ceremonyError(new DOMException("x", "AbortError"))).toBe("passkeyCancelled");
    expect(ceremonyError(new DOMException("x", "SecurityError"))).toBe("passkeyFailed");
    expect(ceremonyError(new Error("x"))).toBe("passkeyFailed");
  });
});
