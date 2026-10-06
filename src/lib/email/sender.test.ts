// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFrom, selectSender } from "./sender";

const message = { to: "person@example.test", subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

afterEach(() => vi.unstubAllGlobals());

describe("selectSender", () => {
  it("uses Resend when a key is set and nothing else is chosen", () => {
    expect(selectSender({ RESEND_API_KEY: "re_x" }).name).toBe("resend");
  });

  it("uses Mailpit with only a Mailpit URL", () => {
    expect(selectSender({ MAILPIT_URL: "http://127.0.0.1:54324" }).name).toBe("mailpit");
  });

  it("lets EMAIL_PROVIDER override a Resend key (local testing keeps mail local)", () => {
    expect(
      selectSender({ EMAIL_PROVIDER: "mailpit", RESEND_API_KEY: "re_x", MAILPIT_URL: "http://127.0.0.1:54324" }).name,
    ).toBe("mailpit");
  });

  it("sends nothing when unconfigured or when the chosen provider has no settings", () => {
    expect(selectSender({}).name).toBe("none");
    expect(selectSender({ EMAIL_PROVIDER: "resend" }).name).toBe("none");
    expect(selectSender({ EMAIL_PROVIDER: "none", RESEND_API_KEY: "re_x" }).name).toBe("none");
  });
});

describe("providers", () => {
  it("posts to Resend with the key in a header and the default sender", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await selectSender({ RESEND_API_KEY: "re_secret" }).send(message);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_secret");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "Aura <onboarding@resend.dev>", to: ["person@example.test"], subject: "Hello" });
    expect(String(url)).not.toContain("re_secret");
  });

  it("posts to Mailpit's send API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await selectSender({ MAILPIT_URL: "http://127.0.0.1:54324", EMAIL_FROM: "Aura <a@b.test>" }).send(message);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:54324/api/v1/send");
    expect(JSON.parse(init.body)).toMatchObject({
      From: { Email: "a@b.test", Name: "Aura" },
      To: [{ Email: "person@example.test" }],
      Text: "Hi",
    });
  });

  it("throws on an error status so sendEmail can report it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 422 })));
    await expect(selectSender({ RESEND_API_KEY: "re_x" }).send(message)).rejects.toThrow("422");
  });
});

describe("parseFrom", () => {
  it("splits a display name from the address", () => {
    expect(parseFrom("Aura <hello@example.com>")).toEqual({ name: "Aura", email: "hello@example.com" });
    expect(parseFrom("hello@example.com")).toEqual({ name: "Aura", email: "hello@example.com" });
  });
});
