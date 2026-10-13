// @vitest-environment node
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";

const root = join(__dirname, "..", "..", "..");

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("one-click unsubscribe links (RFC 8058, D-092)", () => {
  const USER = "0199a000-0000-7000-8000-0000000000aa";
  const OTHER = "0199a000-0000-7000-8000-0000000000bb";

  it("round-trips for a type or the digest", async () => {
    const { unsubscribeQuery, verifyUnsubscribe } = await import("./server/unsubscribe");
    for (const kind of ["announcement", "digest"]) {
      const q = new URLSearchParams(unsubscribeQuery(USER, kind));
      expect(verifyUnsubscribe({ u: q.get("u"), t: q.get("t"), s: q.get("s") })).toEqual({ userId: USER, kind });
    }
  });

  it("can't be moved to another person or type, or forged", async () => {
    const { unsubscribeQuery, verifyUnsubscribe } = await import("./server/unsubscribe");
    const q = new URLSearchParams(unsubscribeQuery(USER, "announcement"));
    expect(verifyUnsubscribe({ u: OTHER, t: "announcement", s: q.get("s") })).toBeNull();
    expect(verifyUnsubscribe({ u: USER, t: "nudge", s: q.get("s") })).toBeNull();
    expect(verifyUnsubscribe({ u: USER, t: "announcement", s: "x".repeat(43) })).toBeNull();
    expect(verifyUnsubscribe({ u: USER, t: "not_a_type", s: q.get("s") })).toBeNull();
    expect(verifyUnsubscribe({ u: "nope", t: "announcement", s: q.get("s") })).toBeNull();
  });

  it("a GET only shows the confirmation page; the change needs a POST", () => {
    const route = readFileSync(join(root, "src/app/api/notify/unsubscribe/route.ts"), "utf8");
    expect(route).toMatch(/export async function GET[\s\S]*NextResponse\.redirect/);
    expect(route.slice(route.indexOf("export async function GET"))).not.toMatch(/applyUnsubscribe/);
    const deliver = readFileSync(join(__dirname, "server/deliver.ts"), "utf8");
    expect(deliver).toContain('"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"');
  });
});

describe("Web Push (D-092)", () => {
  it("a push service answering 404 or 410 means the subscription is gone; other errors retry", async () => {
    const webpush = (await import("web-push")).default;
    // A fresh throwaway key pair for this run, so no key lives in the repo.
    const keys = webpush.generateVAPIDKeys();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@example.test";
    const { WebPushError } = await import("web-push");
    const { sendPush } = await import("@/lib/push/web-push");
    const target = { endpoint: "https://push.example.test/abc", p256dh: "k", auth: "a" };
    for (const [status, expected] of [
      [410, "gone"],
      [404, "gone"],
      [429, "retry"],
      [500, "retry"],
    ] as const) {
      const spy = vi
        .spyOn(webpush, "sendNotification")
        .mockRejectedValueOnce(new WebPushError("x", status, {}, "", target.endpoint));
      expect(await sendPush(target, "{}", { urgent: false, ttlSeconds: 60 })).toBe(expected);
      spy.mockRestore();
    }
    const ok = vi.spyOn(webpush, "sendNotification").mockResolvedValueOnce({ statusCode: 201, body: "", headers: {} });
    expect(await sendPush(target, "{}", { urgent: true, ttlSeconds: 60 })).toBe("sent");
    expect(ok.mock.calls[0]?.[2]).toMatchObject({ urgency: "high", TTL: 60 });
  });

  it("the service worker only opens paths inside the app", () => {
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    const safePath = new Function(
      `${sw.slice(sw.indexOf("function safePath"), sw.indexOf('self.addEventListener("push"'))}; return safePath;`,
    )() as (u: unknown) => string;
    expect(safePath("/groups/x/partner")).toBe("/groups/x/partner");
    expect(safePath("//evil.example")).toBe("/alerts");
    expect(safePath("https://evil.example")).toBe("/alerts");
    expect(safePath("javascript:alert(1)")).toBe("/alerts");
    expect(safePath(undefined)).toBe("/alerts");
  });

  it("the Realtime-style rule holds: the sender never logs addresses, endpoints or words", () => {
    const deliver = readFileSync(join(__dirname, "server/deliver.ts"), "utf8");
    const logs = [...deliver.matchAll(/devLog\(([^)]*)\)/g)].map((m) => m[1] ?? "");
    for (const call of logs) expect(call).toMatch(/^"notifications", (e|error)$/);
  });
});
