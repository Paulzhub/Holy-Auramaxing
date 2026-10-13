// Runs SQL against the LOCAL Supabase database through the Supabase CLI
// (`supabase db query --local`), the same way on Windows, macOS and Linux.
//
// The SQL always goes through a temporary file, and the CLI is started with
// this Node (no npx, no shell). On Windows, `npx` needs cmd.exe, and cmd.exe
// splits an inline statement at its spaces, quotes and brackets, so the
// statement never reached the database (Phase 7c launcher bug, 2026-10-13).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const CLI = require.resolve("supabase/dist/supabase.js");

/**
 * Runs one SQL statement (the CLI's rule) and returns its rows. Throws with
 * the CLI's own message on failure; callers decide what to show, so a
 * secret inside the SQL is never printed here.
 */
export function localQuery(sql) {
  const dir = mkdtempSync(join(tmpdir(), "local-sql-"));
  const file = join(dir, "query.sql");
  try {
    writeFileSync(file, sql);
    const run = spawnSync(process.execPath, [CLI, "db", "query", "--local", "-f", file, "--output-format", "json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error((run.stderr || run.stdout || "").trim() || `exit code ${run.status}`);
    const out = run.stdout;
    return out.includes("{") ? (JSON.parse(out.slice(out.indexOf("{"))).rows ?? []) : [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
