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
    const result = answerObject(run.stdout ?? "");
    // The CLI reports failures as {"_tag": "Error", "error": {message, suggestion}}.
    if (result?._tag === "Error") {
      const { message, suggestion } = result.error ?? {};
      throw new Error([message, suggestion].filter(Boolean).join(" ") || "the Supabase CLI reported an error");
    }
    if (run.status !== 0) throw new Error((run.stderr || run.stdout || "").trim() || `exit code ${run.status}`);
    if (!Array.isArray(result?.rows)) {
      // Never pretend there were no rows: show what the CLI actually said.
      throw new Error(`Unexpected answer from the Supabase CLI: ${(run.stdout ?? "").slice(0, 400)}`);
    }
    return result.rows;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The CLI's answer among the JSON objects it prints. On Windows it prints
 * more than one (an update notice, for example), before or after the answer,
 * so we take the one holding "rows" or an error ("Unexpected non-whitespace
 * character after JSON", then empty results, 2026-10-13/14).
 */
export function answerObject(text) {
  const objects = jsonObjects(text);
  return (
    objects.find((o) => o && typeof o === "object" && ("rows" in o || o._tag === "Error")) ?? objects.at(-1) ?? null
  );
}

/** Every top-level JSON object in the text; braces inside strings are skipped. */
export function jsonObjects(text) {
  const found = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (depth > 0 && inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (depth > 0 && c === '"') inString = true;
    else if (c === "{") {
      if (depth++ === 0) start = i;
    } else if (c === "}" && depth > 0 && --depth === 0) {
      try {
        found.push(JSON.parse(text.slice(start, i + 1)));
      } catch {
        // Not JSON after all (a brace in a plain message); keep looking.
      }
    }
  }
  return found;
}
