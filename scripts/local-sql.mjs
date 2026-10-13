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
    const answer = answerValue(run.stdout ?? "");
    // The CLI reports failures as {"_tag": "Error", "error": {message, suggestion}}.
    if (answer && !Array.isArray(answer) && answer._tag === "Error") {
      const { message, suggestion } = answer.error ?? {};
      throw new Error([message, suggestion].filter(Boolean).join(" ") || "the Supabase CLI reported an error");
    }
    if (run.status !== 0) throw new Error((run.stderr || run.stdout || "").trim() || `exit code ${run.status}`);
    // Linux and macOS print {"rows": [...]}; Windows prints the rows as a bare list.
    const rows = Array.isArray(answer) ? answer : answer?.rows;
    if (!Array.isArray(rows)) {
      // Never pretend there were no rows: show what the CLI actually said.
      throw new Error(`Unexpected answer from the Supabase CLI: ${(run.stdout ?? "").slice(0, 400)}`);
    }
    return rows;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The CLI's answer among the JSON values it prints. On Windows it prints
 * more than one (an update notice, for example) and gives the rows as a bare
 * list, so we take a list, or the object holding "rows" or an error
 * (2026-10-13/14).
 */
export function answerValue(text) {
  const values = jsonValues(text);
  return (
    values.find((v) => v && !Array.isArray(v) && typeof v === "object" && v._tag === "Error") ??
    values.find((v) => Array.isArray(v)) ??
    values.find((v) => v && typeof v === "object" && "rows" in v) ??
    values.at(-1) ??
    null
  );
}

/** Every top-level JSON object or list in the text; brackets inside strings are skipped. */
export function jsonValues(text) {
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
    else if (c === "{" || c === "[") {
      if (depth++ === 0) start = i;
    } else if ((c === "}" || c === "]") && depth > 0 && --depth === 0) {
      try {
        found.push(JSON.parse(text.slice(start, i + 1)));
      } catch {
        // Not JSON after all (brackets in a plain message); keep looking.
      }
    }
  }
  return found;
}
