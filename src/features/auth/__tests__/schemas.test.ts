import { describe, expect, it } from "vitest";

import en from "../../../../messages/en.json";
import { parseNotice } from "../components/auth-notice";
import {
  ageSchema,
  consentSchema,
  emailSignUpSchema,
  fieldErrors,
  newPasswordFormSchema,
  passwordSignInSchema,
  safeNextPath,
} from "../schemas";

const errorKeys = Object.keys(en.auth.errors);

describe("form schemas", () => {
  it("lower-cases and trims email addresses but never touches passwords", () => {
    const parsed = emailSignUpSchema.parse({ email: "  Grace@Example.COM ", password: "  spaces count  " });
    expect(parsed.email).toBe("grace@example.com");
    expect(parsed.password).toBe("  spaces count  ");
  });

  it("follows NIST: 8 characters minimum, no composition rules, long passphrases allowed", () => {
    expect(newPasswordFormSchema.safeParse({ password: "abcdefg" }).success).toBe(false);
    expect(newPasswordFormSchema.safeParse({ password: "abcdefgh" }).success).toBe(true);
    expect(newPasswordFormSchema.safeParse({ password: "😀 unicode and spaces 😀" }).success).toBe(true);
    expect(newPasswordFormSchema.safeParse({ password: "x".repeat(256) }).success).toBe(true);
    expect(newPasswordFormSchema.safeParse({ password: "x".repeat(257) }).success).toBe(false);
  });

  it("requires both consents to be explicitly ticked", () => {
    expect(consentSchema.safeParse({}).success).toBe(false);
    expect(consentSchema.safeParse({ termsPrivacy: "on" }).success).toBe(false);
    expect(consentSchema.safeParse({ termsPrivacy: "on", sensitiveData: "on" }).success).toBe(true);
    expect(consentSchema.safeParse({ termsPrivacy: "true", sensitiveData: "yes" }).success).toBe(false);
  });

  it("only accepts a yes or no answer to the age question", () => {
    expect(ageSchema.safeParse({ adult: "yes" }).success).toBe(true);
    expect(ageSchema.safeParse({ adult: "no" }).success).toBe(true);
    expect(ageSchema.safeParse({ adult: "maybe" }).success).toBe(false);
    expect(ageSchema.safeParse({}).success).toBe(false);
  });

  it("every validation message is a real, translated message key", () => {
    const failures = [
      ageSchema.safeParse({}),
      consentSchema.safeParse({}),
      emailSignUpSchema.safeParse({}),
      emailSignUpSchema.safeParse({ email: "nope", password: "short" }),
      emailSignUpSchema.safeParse({ email: "", password: "x".repeat(300) }),
      passwordSignInSchema.safeParse({}),
    ];
    for (const result of failures) {
      expect(result.success).toBe(false);
      if (result.success) continue;
      for (const key of Object.values(fieldErrors(result.error))) expect(errorKeys).toContain(key);
    }
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/settings", "/settings"],
    ["/groups?tab=mine", "/groups?tab=mine"],
    [undefined, "/home"],
    ["", "/home"],
    ["https://evil.example", "/home"],
    ["//evil.example/x", "/home"],
    ["/\\evil.example", "/home"],
    ["javascript:alert(1)", "/home"],
    ["/api/auth/sign-out", "/home"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("redirect notices", () => {
  it("only known notices are shown, so a URL can't inject text", () => {
    expect(parseNotice("signed-out")).toBe("signed-out");
    expect(parseNotice("Your account is suspended, call 555")).toBeUndefined();
    expect(parseNotice(["expired", "x"])).toBe("expired");
    for (const key of ["expired", "start-here", "signed-out", "link-invalid", "password-updated"]) {
      expect(Object.keys(en.auth.redirectNotices)).toContain(key);
    }
  });
});
