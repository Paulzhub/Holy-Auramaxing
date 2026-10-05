// @vitest-environment node
import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { checkPwnedPassword } from "./pwned-passwords";

function sha1(text: string) {
  return createHash("sha1").update(text).digest("hex").toUpperCase();
}

function fakeRange(body: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

describe("checkPwnedPassword", () => {
  afterEach(() => {
    delete process.env.HIBP_DISABLED;
  });

  it("sends only the first five characters of the SHA-1 hash, with padding", async () => {
    const fetchImpl = fakeRange("");
    await checkPwnedPassword("correct horse battery staple", fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0]!;
    const hash = sha1("correct horse battery staple");
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(String(url)).not.toContain(hash.slice(5));
    expect((init?.headers as Record<string, string>)["Add-Padding"]).toBe("true");
  });

  it("reports a breached password", async () => {
    const suffix = sha1("password").slice(5);
    const result = await checkPwnedPassword(
      "password",
      fakeRange(`0000000000000000000000000000000000A:3\n${suffix}:9545824\n`),
    );
    expect(result).toBe("breached");
  });

  it("ignores padding entries with a count of 0", async () => {
    const suffix = sha1("my long passphrase").slice(5);
    expect(await checkPwnedPassword("my long passphrase", fakeRange(`${suffix}:0\n`))).toBe("not_found");
  });

  it("lets the password through when the service is down or slow", async () => {
    expect(await checkPwnedPassword("anything goes", fakeRange("", 503))).toBe("unavailable");
    const failing = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network");
    });
    expect(await checkPwnedPassword("anything goes", failing)).toBe("unavailable");
  });

  it("can be switched off for offline development", async () => {
    process.env.HIBP_DISABLED = "true";
    const fetchImpl = fakeRange("");
    expect(await checkPwnedPassword("password", fetchImpl)).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
