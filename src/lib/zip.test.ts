// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildExportArchive, exportFileName, toCsv } from "./data-export";
import { crc32, createZip, readZip } from "./zip";

const text = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("createZip", () => {
  it("round-trips files, including UTF-8 names and binary data", () => {
    const binary = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
    const zip = createZip([
      { path: "README.txt", data: text("hello") },
      { path: "csv/prière.csv", data: text("a,b\r\n") },
      { path: "files/avatar.webp", data: binary },
    ]);
    // Local file header signature "PK\3\4" first.
    expect(Array.from(zip.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const back = readZip(zip);
    expect(back.map((e) => e.path)).toEqual(["README.txt", "csv/prière.csv", "files/avatar.webp"]);
    expect(decode(back[0]!.data)).toBe("hello");
    expect(Array.from(back[2]!.data)).toEqual(Array.from(binary));
  });

  it("refuses paths that could escape the folder", () => {
    for (const path of ["../x", "/etc/x", "a/../../b", "a\\b", ""]) {
      expect(() => createZip([{ path, data: text("x") }])).toThrow();
    }
  });

  it("refuses duplicate paths", () => {
    expect(() =>
      createZip([
        { path: "a", data: text("1") },
        { path: "a", data: text("2") },
      ]),
    ).toThrow();
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and line breaks, and leaves empty cells for null", () => {
    expect(toCsv([{ a: 'he said "hi", then', b: null, c: 3 }])).toBe('a,b,c\r\n"he said ""hi"", then",,3\r\n');
    expect(toCsv([{ a: "line\nbreak" }])).toBe('a\r\n"line\nbreak"\r\n');
  });

  it("uses the union of keys as columns", () => {
    expect(toCsv([{ a: 1 }, { b: true }])).toBe("a,b\r\n1,\r\n,true\r\n");
  });

  it("defuses spreadsheet formulas", () => {
    expect(toCsv([{ a: "=HYPERLINK(1)", b: "+1", c: "-x", d: "@y" }])).toBe(
      "a,b,c,d\r\n'=HYPERLINK(1),'+1,'-x,'@y\r\n",
    );
    // Numbers are data, not text, so a negative number stays as it is.
    expect(toCsv([{ n: -5 }])).toBe("n\r\n-5\r\n");
  });
});

describe("buildExportArchive", () => {
  const generatedAt = new Date("2026-10-06T10:00:00Z");

  it("holds README, data.json, one CSV per section and the files", () => {
    const zip = buildExportArchive({
      generatedAt,
      readmeIntro: "Your data.",
      parts: [
        {
          sections: [{ name: "profile", description: "Your profile.", rows: [{ handle: "grace" }] }],
          files: [{ name: "avatar.webp", description: "Your photo.", data: Uint8Array.of(1, 2, 3) }],
        },
        { sections: [{ name: "consents", description: "What you agreed to.", rows: [] }], files: [] },
      ],
    });
    const entries = readZip(zip);
    expect(entries.map((e) => e.path)).toEqual([
      "README.txt",
      "data.json",
      "csv/profile.csv",
      "csv/consents.csv",
      "files/avatar.webp",
    ]);
    const json = JSON.parse(decode(entries[1]!.data)) as Record<string, unknown>;
    expect(json).toMatchObject({
      format: "holy-auramaxing-data-export",
      version: 1,
      generated_at: "2026-10-06T10:00:00.000Z",
      sections: { profile: [{ handle: "grace" }], consents: [] },
      files: ["files/avatar.webp"],
    });
    expect(decode(entries[2]!.data)).toBe("﻿handle\r\ngrace\r\n");
    const readme = decode(entries[0]!.data);
    expect(readme).toContain("csv/profile.csv  Your profile.");
    expect(readme).toContain("files/avatar.webp  Your photo.");
  });

  it("rejects unsafe section or file names", () => {
    expect(() =>
      buildExportArchive({
        generatedAt,
        readmeIntro: "",
        parts: [{ sections: [{ name: "../x", description: "", rows: [] }], files: [] }],
      }),
    ).toThrow();
    expect(() =>
      buildExportArchive({
        generatedAt,
        readmeIntro: "",
        parts: [{ sections: [], files: [{ name: "../a", description: "", data: new Uint8Array() }] }],
      }),
    ).toThrow();
  });

  it("names the file neutrally with the date", () => {
    expect(exportFileName(generatedAt)).toBe("holy-auramaxing-data-2026-10-06.zip");
  });
});
