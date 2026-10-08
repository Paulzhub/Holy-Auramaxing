// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Security review 1, finding SR-4 (D-053): "N wrong tries, then wait" limits
 * must hold when the tries arrive all at once.
 *
 * Both actions below used to peek at the failure count, do the slow check,
 * and only count the failure afterwards. Twenty requests sent together all
 * peeked at zero, so all twenty were tried.
 */

process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const slow = () => new Promise((resolve) => setTimeout(resolve, 20));

const calls = { passwords: 0, codes: 0 };
let jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9", origin: "http://localhost:3100" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (opts: string | { name: string }) => void jar.delete(typeof opts === "string" ? opts : opts.name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en", getTranslations: async () => (k: string) => k }));
vi.mock("@/i18n/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/server/audit", () => ({ audit: async () => {} }));
vi.mock("@/features/auth", () => ({
  requireAccount: async () => ({ userId: "00000000-0000-7000-8000-0000000000aa" }),
}));
vi.mock("@/features/groups/server/picture", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: async () => {
        calls.passwords += 1;
        await slow();
        return { data: { user: null, session: null }, error: { code: "invalid_credentials", status: 400 } };
      },
    },
    rpc: () => ({
      maybeSingle: async () => {
        calls.codes += 1;
        await slow();
        return { data: { status: "invalid", group_name: null, member_count: null }, error: null };
      },
    }),
  }),
}));

const { __resetRateLimitStoreForTests } = await import("@/lib/security/rate-limit");
const { signInAction } = await import("@/features/auth/server/actions");
const { enterInviteCodeAction } = await import("@/features/groups/server/actions");

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

beforeEach(() => {
  __resetRateLimitStoreForTests();
  calls.passwords = 0;
  calls.codes = 0;
  jar = new Map();
});

describe("attempt limits under concurrency", () => {
  it("twenty simultaneous wrong passwords for one address: at most five are tried", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        signInAction({ status: "idle" }, form({ email: "ruth@example.test", password: `guess-number-${i}` })),
      ),
    );
    expect(calls.passwords).toBeLessThanOrEqual(5);
  });

  it("a right password still clears the count afterwards", async () => {
    await signInAction({ status: "idle" }, form({ email: "ruth@example.test", password: "guess-number-1" }));
    expect(calls.passwords).toBe(1);
  });

  it("twenty simultaneous invite codes from one person: at most five are looked up", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        enterInviteCodeAction({ status: "idle" }, form({ code: `ABCDE-${String(10000 + i).slice(-5)}` })),
      ),
    );
    expect(calls.codes).toBeLessThanOrEqual(5);
  });
});
