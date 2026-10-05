import { describe, expect, it } from "vitest";

import { parseProfileForm } from "./profile-schema";

function form(overrides: Record<string, string | undefined> = {}): FormData {
  const base: Record<string, string | undefined> = {
    displayName: "Sam",
    handle: "sam_1",
    bio: "",
    testimony: "",
    favouriteVerse: "",
    profileVisibility: "groups",
    bioVisibility: "groups",
    testimonyVisibility: "partners",
    verseVisibility: "groups",
    showInLeaderboards: "on",
    defaultShareLevel: "checkin_only",
    ...overrides,
  };
  const data = new FormData();
  for (const [k, v] of Object.entries(base)) if (v !== undefined) data.set(k, v);
  return data;
}

describe("parseProfileForm", () => {
  it("accepts a valid profile and turns empty text into null", () => {
    const result = parseProfileForm(form());
    expect(result).toEqual({
      ok: true,
      values: expect.objectContaining({ displayName: "Sam", handle: "sam_1", bio: null, showInLeaderboards: true }),
    });
  });

  it("normalises the handle: trims, drops a leading @, lower-cases", () => {
    const result = parseProfileForm(form({ handle: "  @Grace_Walker " }));
    expect(result.ok && result.values.handle).toBe("grace_walker");
  });

  it("keeps line breaks in the bio and testimony", () => {
    const result = parseProfileForm(form({ bio: "Line one\r\nLine two", testimony: "A\n\nB" }));
    expect(result.ok && result.values.bio).toBe("Line one\nLine two");
    expect(result.ok && result.values.testimony).toBe("A\n\nB");
  });

  it("an unticked leaderboard box means hidden", () => {
    const result = parseProfileForm(form({ showInLeaderboards: undefined }));
    expect(result.ok && result.values.showInLeaderboards).toBe(false);
  });

  it("reports each problem against its field", () => {
    const result = parseProfileForm(
      form({
        handle: "no spaces!",
        bio: "x".repeat(281),
        testimony: "y".repeat(2001),
        favouriteVerse: "Psalm\n23",
        displayName: "z".repeat(41),
        bioVisibility: "everyone",
        defaultShareLevel: "public",
      }),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        handle: "handleInvalid",
        bio: "bioTooLong",
        testimony: "testimonyTooLong",
        favouriteVerse: "textInvalid",
        displayName: "nameTooLong",
        bioVisibility: "choiceInvalid",
        defaultShareLevel: "choiceInvalid",
      },
    });
  });

  it("refuses invisible formatting characters", () => {
    const result = parseProfileForm(form({ bio: "Hi‮there" }));
    expect(result).toEqual({ ok: false, fieldErrors: { bio: "textInvalid" } });
  });
});
