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
    for (const kind of ["announcement", "digest", "partner_sos"]) {
      const q = new URLSearchParams(unsubscribeQuery(USER, kind));
      expect([...q.keys()]).toEqual(["k"]);
      expect(verifyUnsubscribe(q.get("k"))).toEqual({ userId: USER, kind });
    }
  });

  it("can't be moved to another person or type, or forged", async () => {
    const { unsubscribeToken, verifyUnsubscribe } = await import("./server/unsubscribe");
    const k = unsubscribeToken(USER, "announcement");
    // Any changed character fails the check. Flip each character's highest
    // bit: the last character's lowest bits are only padding, so changing
    // those could decode to the very same bytes (a flaky test before).
    for (const i of [0, 14, 30, k.length - 1]) {
      const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      const flipped = k.slice(0, i) + B64[B64.indexOf(k[i]!) ^ 32] + k.slice(i + 1);
      expect(verifyUnsubscribe(flipped)).toBeNull();
    }
    expect(verifyUnsubscribe(unsubscribeToken(OTHER, "announcement"))).toEqual({ userId: OTHER, kind: "announcement" });
    expect(verifyUnsubscribe(unsubscribeToken(USER, "not_a_type"))).toBeNull();
    expect(verifyUnsubscribe("x".repeat(43))).toBeNull();
    expect(verifyUnsubscribe("x".repeat(400))).toBeNull();
    expect(verifyUnsubscribe(null)).toBeNull();
  });

  it("says nothing readable: no account id, no type (privacy review 2, D-098)", async () => {
    const { unsubscribeQuery } = await import("./server/unsubscribe");
    for (const kind of ["streak_at_risk", "partner_sos", "partner_missed", "digest"]) {
      const query = unsubscribeQuery(USER, kind);
      expect(query).not.toContain(USER);
      expect(query).not.toContain(USER.replace(/-/g, ""));
      expect(query).not.toMatch(/streak|partner|sos|missed|digest|u=|t=/i);
      // A fresh value every time, so two emails can't be matched up by their links.
      expect(unsubscribeQuery(USER, kind)).not.toBe(query);
    }
  });

  it("every link in every notification email, and its List-Unsubscribe header, says nothing (D-098)", async () => {
    const { notificationEmailLinks } = await import("./server/unsubscribe");
    const { emailWords } = await import("./outbound");
    const { NOTIFICATION_TYPE_LIST } = await import("./constants");
    const { renderNotificationEmail } = await import("@/emails/notification");
    const { SENSITIVE_WORDS } = await import("@/lib/discretion");
    for (const type of NOTIFICATION_TYPE_LIST) {
      for (const discreet of [true, false]) {
        const words = emailWords({
          type,
          data: { groupName: "NoFap Brothers" },
          discreet,
          actorName: "Sam",
          groupId: "0199a000-0000-7000-8000-000000000001",
        });
        const { oneClick, ...links } = notificationEmailLinks("https://example.test", USER, type, words.url);
        const email = await renderNotificationEmail(words, links);
        // The raw HTML, attributes and all: what a mail app shows on hover.
        for (const [where, text] of [
          [`${type} html`, email.html],
          [`${type} text`, email.text],
          [`${type} List-Unsubscribe`, oneClick],
        ] as const) {
          // The opaque ?k= value is random: it can spell "xXx" by chance, so only the words around it are checked.
          expect(text.replace(/([?&]k=)[A-Za-z0-9_-]+/g, "$1…"), where).not.toMatch(SENSITIVE_WORDS);
          expect(text, where).not.toContain(USER);
          expect(text, where).not.toMatch(/[?&](u|t)=/);
        }
      }
    }
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
    const target = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "k", auth: "a" };
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
