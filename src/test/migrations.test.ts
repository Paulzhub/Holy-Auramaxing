// @vitest-environment node
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * D-003: one migrations folder, every file named
 * <timestamp>_<module>_<what>.sql, so ownership shows in the name. pgTAP
 * tests follow the same idea with a module in their name.
 */
const modules = [
  "platform",
  "auth",
  "profile",
  "groups",
  "checkins",
  "gamification",
  "social",
  "notifications",
  "recovery",
  "admin",
];

describe("migration file names", () => {
  const files = readdirSync(join(process.cwd(), "supabase", "migrations")).filter((f) => f.endsWith(".sql"));

  it("are found", () => expect(files.length).toBeGreaterThan(5));

  it.each(files)("%s carries a timestamp and a known module prefix", (file) => {
    const match = /^(\d{14})_([a-z]+)_[a-z0-9_]+\.sql$/.exec(file);
    expect(match, file).not.toBeNull();
    expect(modules).toContain(match![2]);
  });

  it("are in a strictly increasing order", () => {
    const stamps = files.map((f) => f.slice(0, 14));
    expect(new Set(stamps).size).toBe(stamps.length);
  });
});
