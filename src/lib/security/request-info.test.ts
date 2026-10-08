// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Security review 1, finding SR-3 (D-052): per-network rate limits must key
 * on an address the client can't choose.
 */
let incoming = new Headers();
vi.mock("next/headers", () => ({ headers: async () => incoming }));

const { clientIp } = await import("./request-info");

describe("clientIp", () => {
  const saved = process.env.TRUSTED_IP_HEADER;
  beforeEach(() => {
    delete process.env.TRUSTED_IP_HEADER;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TRUSTED_IP_HEADER;
    else process.env.TRUSTED_IP_HEADER = saved;
  });

  it("ignores an X-Forwarded-For entry the client wrote itself", async () => {
    // The client sent "X-Forwarded-For: 6.6.6.6"; the proxy in front of us
    // appended the real address it saw.
    incoming = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(await clientIp()).toBe("203.0.113.9");
  });

  it("gives every spoofed variant the same key", async () => {
    const keys = new Set<string>();
    for (const fake of ["1.1.1.1", "2.2.2.2", "3.3.3.3, 4.4.4.4"]) {
      incoming = new Headers({ "x-forwarded-for": `${fake}, 203.0.113.9` });
      keys.add(await clientIp());
    }
    expect([...keys]).toEqual(["203.0.113.9"]);
  });

  it("does not trust CDN headers unless told the app sits behind that CDN", async () => {
    incoming = new Headers({ "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "203.0.113.9" });
    expect(await clientIp()).toBe("203.0.113.9");
  });

  it("behind Cloudflare, uses CF-Connecting-IP and nothing the client sent", async () => {
    process.env.TRUSTED_IP_HEADER = "cf-connecting-ip";
    incoming = new Headers({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6, 172.70.1.1" });
    expect(await clientIp()).toBe("198.51.100.7");
  });

  it("falls back to one shared 'unknown' key rather than a client-chosen one", async () => {
    process.env.TRUSTED_IP_HEADER = "cf-connecting-ip";
    incoming = new Headers({ "x-forwarded-for": "6.6.6.6" });
    expect(await clientIp()).toBe("unknown");
  });
});
