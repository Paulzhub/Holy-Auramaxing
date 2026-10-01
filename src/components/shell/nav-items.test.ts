import { describe, expect, it } from "vitest";

import { isActive, navItems } from "./nav-items";

describe("navigation", () => {
  it("has the five bottom-nav destinations from the spec, in order", () => {
    expect(navItems.map((i) => i.key)).toEqual(["home", "groups", "checkIn", "alerts", "me"]);
  });

  it("marks the current page and its sub-pages only", () => {
    expect(isActive("/groups", "/groups")).toBe(true);
    expect(isActive("/groups/abc", "/groups")).toBe(true);
    expect(isActive("/groupsettings", "/groups")).toBe(false);
    expect(isActive("/home", "/groups")).toBe(false);
  });
});
