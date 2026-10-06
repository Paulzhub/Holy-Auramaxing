/**
 * A minimal ZIP writer (PKWARE APPNOTE 6.3): files are "stored" (no
 * compression), names are UTF-8. Enough for the data export (D-032) without
 * a dependency. Every unzip tool, and the file managers on Windows, macOS,
 * Android and iOS, can open the result.
 */

export interface ZipEntry {
  /** Path inside the archive, with forward slashes, e.g. "csv/profile.csv". */
  path: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time fields (local time is customary; we use UTC for reproducibility). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

function safePath(path: string): string {
  if (!path || path.length > 200 || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`Unsafe zip path: ${path}`);
  }
  return path;
}

const UTF8_FLAG = 0x0800;
const MAX_SIZE = 0xfffffffe;

export function createZip(entries: ZipEntry[], modified: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const seen = new Set<string>();

  for (const entry of entries) {
    const name = encoder.encode(safePath(entry.path));
    if (seen.has(entry.path)) throw new Error(`Duplicate zip path: ${entry.path}`);
    seen.add(entry.path);
    if (entry.data.length > MAX_SIZE) throw new Error("File too large for a ZIP without ZIP64.");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed (2.0)
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra field length
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // extra, comment, disk start, internal and external attributes: all 0
    cv.setUint32(42, offset, true); // offset of the local header
    central.set(name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory signature
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Reads back an archive made by createZip (stored entries only). Used by tests. */
export function readZip(archive: Uint8Array): ZipEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const endAt = archive.length - 22;
  if (view.getUint32(endAt, true) !== 0x06054b50) throw new Error("Not a zip (no end record).");
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("Bad central directory.");
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const path = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength));
    const localNameLength = view.getUint16(localAt + 26, true);
    const start = localAt + 30 + localNameLength;
    const data = archive.slice(start, start + size);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${path}`);
    entries.push({ path, data });
    at += 46 + nameLength;
  }
  return entries;
}
