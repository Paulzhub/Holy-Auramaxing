import { createHash } from "node:crypto";

import { readServerEnv } from "@/lib/env";

/**
 * Fixed-window rate limits (CLAUDE.md §10).
 *
 * Production uses Upstash Redis through its REST API, so every server
 * instance shares one count. Without Upstash configured (local development,
 * tests) an in-memory store is used, which is per-process only.
 *
 * Keys are hashed before they are stored, so Redis never holds an email
 * address or an IP address.
 */
export const rateLimitRules = {
  /** Every sign-in attempt from one network address. */
  signInByIp: { limit: 20, windowSeconds: 15 * 60 },
  /** Failed password attempts for one email address: after 5, wait out the window. */
  signInFailuresByEmail: { limit: 5, windowSeconds: 15 * 60 },
  signUpByIp: { limit: 10, windowSeconds: 60 * 60 },
  /** Magic links, password resets and verification resends. */
  emailByIp: { limit: 10, windowSeconds: 60 * 60 },
  emailByAddress: { limit: 3, windowSeconds: 60 * 60 },
  /** The age and consent steps, which issue sign-up tickets. */
  signUpTicketByIp: { limit: 20, windowSeconds: 60 * 60 },
  passwordChangeByUser: { limit: 5, windowSeconds: 60 * 60 },
  /** New profile photos (each one is re-encoded and screened). */
  avatarUploadByUser: { limit: 10, windowSeconds: 60 * 60 },
  /** Profile and privacy saves. */
  profileSaveByUser: { limit: 60, windowSeconds: 60 * 60 },
} as const;

export type RateLimitRule = keyof typeof rateLimitRules;

export interface RateLimitResult {
  ok: boolean;
  /** How many seconds until the window resets (0 when ok). */
  retryAfterSeconds: number;
}

interface Store {
  /** Adds one and returns the new count and the window's remaining time in ms. */
  increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
  /** Current count without changing it. */
  peek(key: string): Promise<{ count: number; ttlMs: number }>;
  reset(key: string): Promise<void>;
}

class MemoryStore implements Store {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  private live(key: string) {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async increment(key: string, windowMs: number) {
    const entry = this.live(key) ?? { count: 0, resetAt: Date.now() + windowMs };
    entry.count += 1;
    this.entries.set(key, entry);
    if (this.entries.size > 10_000) this.sweep();
    return { count: entry.count, ttlMs: entry.resetAt - Date.now() };
  }

  async peek(key: string) {
    const entry = this.live(key);
    return entry ? { count: entry.count, ttlMs: entry.resetAt - Date.now() } : { count: 0, ttlMs: 0 };
  }

  async reset(key: string) {
    this.entries.delete(key);
  }

  private sweep() {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
  }
}

class UpstashStore implements Store {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`Upstash responded ${res.status}`);
    const results = (await res.json()) as { result?: unknown; error?: string }[];
    return results.map((r) => {
      if (r.error) throw new Error(`Upstash error: ${r.error}`);
      return r.result;
    });
  }

  async increment(key: string, windowMs: number) {
    const [count, , ttl] = await this.pipeline([
      ["INCR", key],
      ["PEXPIRE", key, windowMs, "NX"],
      ["PTTL", key],
    ]);
    return { count: Number(count), ttlMs: Math.max(0, Number(ttl)) };
  }

  async peek(key: string) {
    const [count, ttl] = await this.pipeline([
      ["GET", key],
      ["PTTL", key],
    ]);
    return { count: Number(count ?? 0), ttlMs: Math.max(0, Number(ttl)) };
  }

  async reset(key: string) {
    await this.pipeline([["DEL", key]]);
  }
}

let store: Store | undefined;

function getStore(): Store {
  if (!store) {
    const env = readServerEnv();
    store =
      env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
        ? new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
        : new MemoryStore();
  }
  return store;
}

/** For tests only. */
export function __resetRateLimitStoreForTests() {
  store = new MemoryStore();
}

function storageKey(rule: RateLimitRule, subject: string): string {
  const digest = createHash("sha256").update(subject.trim().toLowerCase()).digest("base64url").slice(0, 32);
  return `rl:${rule}:${digest}`;
}

function result(count: number, ttlMs: number, limit: number): RateLimitResult {
  const ok = count <= limit;
  return { ok, retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil(ttlMs / 1000)) };
}

/**
 * Counts one attempt against `rule` for `subject` (an IP address, an email,
 * a user id). If the store is unreachable the request is allowed: an outage
 * in the limiter must not lock everyone out. Supabase Auth's own limits and
 * Turnstile still apply.
 */
export async function consume(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const { limit, windowSeconds } = rateLimitRules[rule];
  try {
    const { count, ttlMs } = await getStore().increment(storageKey(rule, subject), windowSeconds * 1000);
    return result(count, ttlMs, limit);
  } catch {
    return { ok: true, retryAfterSeconds: 0 };
  }
}

/** Checks a rule without counting an attempt (e.g. before trying a password). */
export async function check(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const { limit } = rateLimitRules[rule];
  try {
    const { count, ttlMs } = await getStore().peek(storageKey(rule, subject));
    return { ok: count < limit, retryAfterSeconds: count < limit ? 0 : Math.max(1, Math.ceil(ttlMs / 1000)) };
  } catch {
    return { ok: true, retryAfterSeconds: 0 };
  }
}

export async function clear(rule: RateLimitRule, subject: string): Promise<void> {
  try {
    await getStore().reset(storageKey(rule, subject));
  } catch {
    // Best effort.
  }
}
