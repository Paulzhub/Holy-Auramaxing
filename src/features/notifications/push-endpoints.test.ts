// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { pushEndpointSchema, pushSubscriptionSchema } from "./schemas";

/**
 * Security review 2, SR2-2 (D-094): a push subscription may point only at a
 * browser's push service. Anything else would let a signed-in person make
 * the server POST to an address of their choosing (a home router, a cloud
 * metadata service) every time they're notified.
 */

const keys = { p256dh: "BAAAAAAAAAAAAAAAAAAAAAAAAAA", auth: "AAAAAAAAAA" };

const refused = [
  "https://192.168.1.1:8443/admin/reboot",
  "https://10.0.0.5/internal",
  "https://169.254.169.254.nip.io/latest/meta-data",
  "https://localhost/x",
  "https://fcm.googleapis.com.attacker.test/fcm/send/x",
  "https://attacker.test/fcm.googleapis.com/fcm/send/x",
  "https://fcm.googleapis.com:8443/fcm/send/x",
  "https://someone@fcm.googleapis.com/fcm/send/x",
  "https://notify.windows.com/w/?token=x",
  "https://evil.notify.windows.com.attacker.test/w/",
];

const accepted = [
  "https://fcm.googleapis.com/fcm/send/dGVzdA:APA91bTest",
  "https://fcm.googleapis.com/wp/dGVzdA",
  "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABtest",
  "https://web.push.apple.com/QGuQyavXutnMH3IAABtest",
  "https://wns2-par02p.notify.windows.com/w/?token=BQYAAABtest",
];

describe("push endpoints (SR2-2)", () => {
  it.each(refused)("the subscribe route refuses %s", (endpoint) => {
    expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
    expect(pushEndpointSchema.safeParse({ endpoint }).success).toBe(false);
  });

  it.each(accepted)("the subscribe route accepts %s", (endpoint) => {
    expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(true);
  });

  it("the sender never contacts anything but a push service, even if one got into the database", async () => {
    const webpush = (await import("web-push")).default;
    const vapid = webpush.generateVAPIDKeys();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapid.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@example.test";
    const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    const { sendPush } = await import("@/lib/push/web-push");
    const result = await sendPush({ endpoint: "https://192.168.1.1:8443/admin", p256dh: "k", auth: "a" }, "{}", {
      urgent: false,
      ttlSeconds: 60,
    });
    expect(send).not.toHaveBeenCalled();
    // "gone": the database deletes it at once.
    expect(result).toBe("gone");
    send.mockRestore();
  });
});
