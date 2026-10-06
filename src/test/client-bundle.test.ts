// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Zod stays on the server (D-010): it adds ~60 KB to the browser and its
 * JIT check trips our CSP (no eval). Client components may import types
 * from schema files, but values only from modules that don't import Zod.
 */
const root = resolve(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(root, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

describe("client components", () => {
  const clientFiles = files(root).filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

  it("are found", () => expect(clientFiles.length).toBeGreaterThan(10));

  it("never import Zod, directly or through a value import", () => {
    const offenders: string[] = [];
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      // Value imports only: `import type …` is erased at build time.
      for (const match of source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gms)) {
        const spec = match[1]!;
        if (spec === "zod") offenders.push(`${file} imports zod`);
        const target = resolveImport(file, spec);
        // "use server" modules become references in the browser, not code.
        if (!target) continue;
        const text = readFileSync(target, "utf8");
        if (/^\s*["']use server["']/.test(text)) continue;
        if (/from\s+["']zod["']/.test(text)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
