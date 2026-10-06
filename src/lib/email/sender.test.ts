// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "x" });
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ createTransport: (...args: unknown[]) => createTransport(...(args as [])) }));

import { parseFrom, selectSender } from "./sender";

const gmail = {
  EMAIL_PROVIDER: "smtp" as const,
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "aura.notices@gmail.com",
  SMTP_PASSWORD: "abcd efgh ijkl mnop",
};

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

  it("uses SMTP with a host and no Resend key", () => {
    expect(selectSender({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.test", SMTP_PASSWORD: "x" }).name).toBe("smtp");
  });

  it("SMTP without a user or password sends nothing rather than failing later", () => {
    expect(selectSender({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.gmail.com" }).name).toBe("none");
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

describe("smtp provider", () => {
  it("uses TLS on 465 by default and sends as the signed-in account", async () => {
    createTransport.mockClear();
    sendMail.mockClear();
    await selectSender(gmail).send(message);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: "aura.notices@gmail.com", pass: "abcd efgh ijkl mnop" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: "Aura <aura.notices@gmail.com>",
      to: "person@example.test",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("requires STARTTLS on 587", async () => {
    createTransport.mockClear();
    await selectSender({ ...gmail, SMTP_PORT: 587 }).send(message);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false, requireTLS: true }),
    );
  });

  it("reuses one connection setup for several emails", async () => {
    createTransport.mockClear();
    const sender = selectSender(gmail);
    await sender.send(message);
    await sender.send(message);
    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  it("passes SMTP errors on so sendEmail can report them", async () => {
    sendMail.mockRejectedValueOnce(new Error("535 Username and Password not accepted"));
    await expect(selectSender(gmail).send(message)).rejects.toThrow("535");
  });
});

describe("parseFrom", () => {
  it("splits a display name from the address", () => {
    expect(parseFrom("Aura <hello@example.com>")).toEqual({ name: "Aura", email: "hello@example.com" });
    expect(parseFrom("hello@example.com")).toEqual({ name: "Aura", email: "hello@example.com" });
  });
});
