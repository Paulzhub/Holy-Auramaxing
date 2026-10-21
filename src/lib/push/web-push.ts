import webpush, { WebPushError, type PushSubscription } from "web-push";

import { readPublicEnv, readServerEnv } from "@/lib/env";

import { isPushServiceEndpoint } from "./endpoints";

/**
 * Web Push with VAPID (CLAUDE.md §13, D-092), through the `web-push`
 * package (payload encryption, RFC 8291; VAPID, RFC 8292). Server-only: the
 * private key never leaves the server. Off unless all three keys are set.
 */

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = "sent" | "gone" | "retry";

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = readPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const { VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = readServerEnv();
  configured = Boolean(publicKey && privateKey && subject);
  if (configured) webpush.setVapidDetails(subject!, publicKey!, privateKey!);
  return configured;
}

/**
 * Send one encrypted payload. 404 and 410 mean the subscription is gone
 * (the person removed it, or the browser expired it): delete it. Anything
 * else is worth a later try.
 */
export async function sendPush(
  target: PushTarget,
  payload: string,
  options: { urgent: boolean; ttlSeconds: number },
): Promise<PushResult> {
  if (!pushConfigured()) return "retry";
  // Never contact anything but a push service (SR2-2); the database refuses
  // others too. "gone" deletes the subscription.
  if (!isPushServiceEndpoint(target.endpoint)) return "gone";
  const subscription: PushSubscription = {
    endpoint: target.endpoint,
    keys: { p256dh: target.p256dh, auth: target.auth },
  };
  try {
    await webpush.sendNotification(subscription, payload, {
      TTL: options.ttlSeconds,
      urgency: options.urgent ? "high" : "normal",
      timeout: 8_000,
    });
    return "sent";
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return "gone";
    return "retry";
  }
}
