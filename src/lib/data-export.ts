import { createZip, type ZipEntry } from "./zip";

/**
 * The shape of "Download my data" (CLAUDE.md §7.1, §11; D-032).
 *
 * Each feature module contributes sections (one table each) and, rarely,
 * files (a profile photo). This file turns them into one zip:
 *
 *   data.json        every section, in one file
 *   csv/<name>.csv   one CSV per section
 *   files/…          the module files (e.g. files/avatar.webp)
 *   README.txt       what everything is, in plain words
 */

export type ExportValue = string | number | boolean | null;
export type ExportRow = Record<string, ExportValue>;

export interface ExportSection {
  /** File-safe name, e.g. "profile" or "security_events". */
  name: string;
  /** One line for README.txt. */
  description: string;
  rows: ExportRow[];
}

export interface ExportFile {
  /** Path under files/, e.g. "avatar.webp". */
  name: string;
  description: string;
  data: Uint8Array;
}

export interface ExportPart {
  sections: ExportSection[];
  files: ExportFile[];
}

const NAME = /^[a-z][a-z0-9_]{0,40}$/;
const FILE_NAME = /^[a-z0-9][a-z0-9_.-]{0,60}$/;

/**
 * RFC 4180 CSV with a header row (the union of keys, in first-seen order).
 * Cells starting with = + - @ tab or CR get a leading apostrophe so a
 * spreadsheet never runs them as formulas (CSV injection).
 */
export function toCsv(rows: ExportRow[]): string {
  const columns: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  const cell = (value: ExportValue | undefined): string => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export interface ExportArchiveInput {
  generatedAt: Date;
  parts: ExportPart[];
  /** Plain-language README text; the section and file list is appended. */
  readmeIntro: string;
}

export function buildExportArchive({ generatedAt, parts, readmeIntro }: ExportArchiveInput): Uint8Array {
  const encoder = new TextEncoder();
  const sections = parts.flatMap((p) => p.sections);
  const files = parts.flatMap((p) => p.files);

  for (const s of sections) if (!NAME.test(s.name)) throw new Error(`Bad section name: ${s.name}`);
  for (const f of files) if (!FILE_NAME.test(f.name)) throw new Error(`Bad file name: ${f.name}`);

  const json = {
    format: "aura-data-export",
    version: 1,
    generated_at: generatedAt.toISOString(),
    sections: Object.fromEntries(sections.map((s) => [s.name, s.rows])),
    files: files.map((f) => `files/${f.name}`),
  };

  const readme = [
    readmeIntro.trim(),
    "",
    ...sections.map((s) => `csv/${s.name}.csv  ${s.description}`),
    ...files.map((f) => `files/${f.name}  ${f.description}`),
    "",
  ].join("\r\n");

  const entries: ZipEntry[] = [
    { path: "README.txt", data: encoder.encode(readme) },
    { path: "data.json", data: encoder.encode(`${JSON.stringify(json, null, 2)}\n`) },
    // A byte-order mark so Excel reads the CSVs as UTF-8.
    ...sections.map((s) => ({ path: `csv/${s.name}.csv`, data: encoder.encode(`﻿${toCsv(s.rows)}`) })),
    ...files.map((f) => ({ path: `files/${f.name}`, data: f.data })),
  ];
  return createZip(entries, generatedAt);
}

/** "aura-data-2026-10-06.zip": neutral, like everything else people see (§2.3). */
export function exportFileName(generatedAt: Date): string {
  return `aura-data-${generatedAt.toISOString().slice(0, 10)}.zip`;
}
