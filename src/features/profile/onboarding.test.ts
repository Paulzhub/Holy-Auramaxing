import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { displayNameSchema, myWhySchema, nextStep, onboardingSteps, parseStep, reminderSchema } from "./onboarding";

describe("onboarding steps", () => {
  it("defaults unknown steps to the first one", () => {
    expect(parseStep(undefined)).toBe("welcome");
    expect(parseStep("../../admin")).toBe("welcome");
    expect(parseStep("reminder")).toBe("reminder");
  });

  it("walks the steps in order and ends after the group step", () => {
    expect(onboardingSteps.map((s) => nextStep(s))).toEqual(["why", "reminder", "discreet", "group", undefined]);
  });
});

describe("onboarding fields", () => {
  it("accepts names in any script, refuses control characters and long names", () => {
    expect(displayNameSchema.safeParse("Grace").success).toBe(true);
    expect(displayNameSchema.safeParse("ग्रेस 🙏").success).toBe(true);
    expect(displayNameSchema.safeParse("bad\u0000name").success).toBe(false);
    expect(displayNameSchema.safeParse("‮evil").success).toBe(false);
    expect(displayNameSchema.safeParse("x".repeat(41)).success).toBe(false);
  });

  it("limits my why to 500 characters", () => {
    expect(myWhySchema.safeParse("x".repeat(500)).success).toBe(true);
    expect(myWhySchema.safeParse("x".repeat(501)).success).toBe(false);
  });

  it("allows an empty reminder (no reminder) or a 24-hour time", () => {
    expect(reminderSchema.safeParse({ reminderTime: "", timezone: "UTC" }).success).toBe(true);
    expect(reminderSchema.safeParse({ reminderTime: "21:30", timezone: "UTC" }).success).toBe(true);
    expect(reminderSchema.safeParse({ reminderTime: "25:00", timezone: "UTC" }).success).toBe(false);
  });

  it("has a message for every error key", () => {
    for (const key of ["nameTooLong", "nameInvalid", "whyTooLong", "timeInvalid", "timezoneInvalid", "saveFailed"]) {
      expect(Object.keys(en.onboarding.errors)).toContain(key);
    }
  });
});
