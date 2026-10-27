import { describe, expect, it } from "vitest";

import { installWay, isAppleMobile } from "./install-store";

describe("installing (D-127)", () => {
  it("picks the right way for each device", () => {
    const base = { standalone: false, installedNow: false, hasPrompt: false, appleMobile: false };
    expect(installWay({ ...base, standalone: true, hasPrompt: true })).toBe("installed");
    expect(installWay({ ...base, installedNow: true })).toBe("installed");
    expect(installWay({ ...base, hasPrompt: true })).toBe("prompt");
    expect(installWay({ ...base, appleMobile: true })).toBe("ios");
    expect(installWay(base)).toBe("none");
  });

  it("knows an iPhone, and an iPad that says it's a Mac", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Linux; Android 14)", 5)).toBe(false);
  });
});
