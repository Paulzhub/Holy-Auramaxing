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
    const result = firstJsonObject(run.stdout ?? "");
    // The CLI reports failures as {"_tag": "Error", "error": {message, suggestion}}.
    if (result?._tag === "Error") {
      const { message, suggestion } = result.error ?? {};
      throw new Error([message, suggestion].filter(Boolean).join(" ") || "the Supabase CLI reported an error");
    }
    if (run.status !== 0) throw new Error((run.stderr || run.stdout || "").trim() || `exit code ${run.status}`);
    return result?.rows ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The first complete JSON object in the CLI's output. Anything around it is
 * ignored: on Windows the CLI can print more after the JSON (an update
 * notice, for example), which made JSON.parse fail ("Unexpected non-whitespace
 * character after JSON", 2026-10-13). Braces inside strings are skipped.
 */
export function firstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("The Supabase CLI's answer wasn't complete JSON.");
}
