// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Security review 2, SR2-4 (D-096): live-update pings travel on private
 * Realtime channels, which browsers may listen to but never send on. A
 * listener that joins without `private: true` would hear nothing, and a
 * public channel would again let anyone who knows its name fake pings.
 */

const src = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("Realtime channels (SR2-4)", () => {
  const calls = files(src).flatMap((path) =>
    [...readFileSync(path, "utf8").matchAll(/\.channel\(([^;]*?)\);/gs)].map((m) => ({ path, call: m[1] ?? "" })),
  );

  it("the app has listeners (the bell and a group's live updates)", () => {
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it.each(calls.map((c) => [c.path.slice(src.length + 1), c.call]))("%s joins a private channel", (_path, call) => {
    expect(call).toMatch(/private:\s*true/);
  });

  it("the database sends every ping as a private message", () => {
    const migrations = join(src, "..", "supabase", "migrations");
    const latest = readdirSync(migrations)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(migrations, f), "utf8"))
      .join("\n");
    // The last definition of each ping function wins.
    for (const fn of ["private.ping_group", "private.ping_user"]) {
      const defs = latest.split(`create or replace function ${fn}(`);
      expect(defs.length).toBeGreaterThan(1);
      expect(defs.at(-1)!.split("$$;")[0]).toMatch(/realtime\.send\([\s\S]*,\s*true\);/);
    }
  });
});
