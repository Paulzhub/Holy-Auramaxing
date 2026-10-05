// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetRateLimitStoreForTests, check, clear, consume, rateLimitRules } from "./rate-limit";

describe("rate limits (in-memory store)", () => {
  beforeEach(() => {
    __resetRateLimitStoreForTests();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit, then asks the caller to wait", async () => {
    const { limit } = rateLimitRules.signUpByIp;
    for (let i = 0; i < limit; i++) expect((await consume("signUpByIp", "10.0.0.1")).ok).toBe(true);
    const blocked = await consume("signUpByIp", "10.0.0.1");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // Another address is unaffected.
    expect((await consume("signUpByIp", "10.0.0.2")).ok).toBe(true);
  });

  it("resets when the window ends", async () => {
    const { limit, windowSeconds } = rateLimitRules.emailByAddress;
    for (let i = 0; i <= limit; i++) await consume("emailByAddress", "a@example.test");
    expect((await check("emailByAddress", "a@example.test")).ok).toBe(false);
    vi.advanceTimersByTime(windowSeconds * 1000 + 1);
    expect((await check("emailByAddress", "a@example.test")).ok).toBe(true);
  });

  it("locks out an address after five wrong passwords, and a success clears it", async () => {
    for (let i = 0; i < 5; i++) await consume("signInFailuresByEmail", "b@example.test");
    expect((await check("signInFailuresByEmail", "b@example.test")).ok).toBe(false);
    // Keys are case-insensitive, so changing case doesn't dodge the lock.
    expect((await check("signInFailuresByEmail", "B@Example.TEST")).ok).toBe(false);
    await clear("signInFailuresByEmail", "b@example.test");
    expect((await check("signInFailuresByEmail", "b@example.test")).ok).toBe(true);
  });
});
