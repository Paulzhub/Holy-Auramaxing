// @vitest-environment node
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";

import { databaseErrorKeys, groupErrorKey } from "./errors";
import { createGroupFields, createGroupSchema, inviteSchema, joinSchema, parseForm } from "./schemas";
import { decodeHeldInvite, encodeHeldInvite } from "./server/invite-cookie";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

const valid = {
  name: "  Iron   Sharpens  ",
  description: "Proverbs 27:17\r\n",
  challengeType: "40",
  customDays: "",
  startDate: "2026-10-10",
  timezone: "Asia/Kolkata",
  maxMembers: "12",
  joinPolicy: "invite_only",
  covenant: "We check in honestly and pray daily.",
  minShareLevel: "streak",
  hidingAllowed: "on",
  myShareLevel: "full",
};

describe("createGroupSchema", () => {
  it("tidies and accepts a good group", () => {
    const result = parseForm(createGroupSchema, form(valid), createGroupFields);
    expect(result).toEqual({
      ok: true,
      values: expect.objectContaining({
        name: "Iron Sharpens",
        description: "Proverbs 27:17",
        customDays: null,
        maxMembers: 12,
        hidingAllowed: true,
      }),
    });
  });

  it("needs a number of days only for a custom challenge", () => {
    const custom = parseForm(
      createGroupSchema,
      form({ ...valid, challengeType: "custom", customDays: "3" }),
      createGroupFields,
    );
    expect(custom).toEqual({ ok: false, fieldErrors: { customDays: "customDaysRange" } });
    const ok = parseForm(
      createGroupSchema,
      form({ ...valid, challengeType: "custom", customDays: "21" }),
      createGroupFields,
    );
    expect(ok.ok && ok.values.customDays).toBe(21);
  });

  it("names each problem with a message key", () => {
    const result = parseForm(
      createGroupSchema,
      form({ ...valid, name: "x", covenant: "short", timezone: "Mars/Olympus", maxMembers: "1", startDate: "soon" }),
      createGroupFields,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: "nameLength",
        covenant: "covenantLength",
        timezone: "timezoneInvalid",
        maxMembers: "maxMembersRange",
        startDate: "startDateInvalid",
      },
    });
  });

  it("refuses invisible control characters", () => {
    const result = parseForm(createGroupSchema, form({ ...valid, name: "Iron‮Sharpens" }), createGroupFields);
    expect(result).toEqual({ ok: false, fieldErrors: { name: "textInvalid" } });
  });
});

describe("inviteSchema", () => {
  it("offers fixed expiry choices and an optional use limit", () => {
    expect(parseForm(inviteSchema, form({ expiresInDays: "7", maxUses: "" }), ["expiresInDays", "maxUses"])).toEqual({
      ok: true,
      values: { expiresInDays: 7, maxUses: null },
    });
    expect(parseForm(inviteSchema, form({ expiresInDays: "8", maxUses: "0" }), ["expiresInDays", "maxUses"])).toEqual({
      ok: false,
      fieldErrors: { expiresInDays: "choiceInvalid", maxUses: "maxUsesRange" },
    });
  });
});

describe("joinSchema", () => {
  it("needs the covenant accepted", () => {
    const fields = ["shareLevel", "leaderboardHidden", "accept", "covenantSeen"] as const;
    const seen = "2026-10-07T06:18:27.727338+00:00";
    expect(parseForm(joinSchema, form({ shareLevel: "full", covenantSeen: seen }), fields)).toEqual({
      ok: false,
      fieldErrors: { accept: "covenantNotAccepted" },
    });
    expect(parseForm(joinSchema, form({ shareLevel: "full", accept: "on", covenantSeen: seen }), fields).ok).toBe(true);
  });
});

describe("errors", () => {
  it("map every database error to a message, and anything else to saveFailed", () => {
    const messages = en.groups.errors as Record<string, string>;
    for (const key of databaseErrorKeys) expect(messages[key], key).toBeTruthy();
    expect(groupErrorKey({ message: "group_full" })).toBe("full");
    expect(groupErrorKey({ message: "something unexpected" })).toBe("saveFailed");
    expect(groupErrorKey(null)).toBe("saveFailed");
  });

  it("include the picture errors the shared image picker uses", () => {
    for (const key of Object.keys(en.profile.errors).filter((k) => k.startsWith("avatar"))) {
      expect((en.groups.errors as Record<string, string>)[key], key).toBeTruthy();
    }
    expect(Object.keys(en.groups.picture).sort()).toEqual(Object.keys(en.profile.avatar).sort());
  });
});

describe("the held-invite cookie", () => {
  it("keeps only a hash, and reads back only what it wrote", () => {
    const hash = "a".repeat(64);
    expect(decodeHeldInvite(encodeHeldInvite("token", hash))).toEqual({ tokenHash: hash, codeHash: null });
    expect(decodeHeldInvite(encodeHeldInvite("code", hash))).toEqual({ tokenHash: null, codeHash: hash });
    for (const bad of [undefined, "", "t.short", `x.${hash}`, `t.${hash}extra`, `t.${"A".repeat(64)}`]) {
      expect(decodeHeldInvite(bad)).toBeNull();
    }
  });
});
