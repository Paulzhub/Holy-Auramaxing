import sharp, { type Sharp } from "sharp";

/**
 * Square image processing (avatars and group pictures) (CLAUDE.md §7.3, §10). Server only.
 *
 * Every photo is decoded and re-encoded from its pixels: nothing from the
 * original file (EXIF, GPS, XMP, ICC comments, embedded thumbnails, trailing
 * bytes) survives. sharp drops all metadata unless asked to keep it.
 */

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Pixel sizes stored for each avatar (square WebP). */
export const SQUARE_IMAGE_SIZES = [96, 256, 512] as const;
export type SquareImagePixels = (typeof SQUARE_IMAGE_SIZES)[number];

export type ImageKind = "jpeg" | "png" | "webp";

/** Identifies the file by its first bytes, never by its name or the browser's claim. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  const at = (i: number, ...values: number[]) => values.every((v, k) => bytes[i + k] === v);
  if (bytes.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "jpeg";
  if (bytes.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  // "RIFF" <size> "WEBP"
  if (bytes.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  return null;
}

export class SquareImageError extends Error {
  constructor(readonly reason: "type" | "size" | "unreadable" | "tooSmall") {
    super(`image rejected: ${reason}`);
  }
}

const MIN_SIDE = 64;
// Decompression-bomb guard: refuse anything over ~40 megapixels.
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Checks the file and returns square WebP renditions, keyed by pixel size.
 * The crop is centred; the browser normally sends an already-square crop.
 */
export async function processSquareImage(input: Uint8Array): Promise<Record<SquareImagePixels, Buffer>> {
  if (input.byteLength === 0 || input.byteLength > IMAGE_MAX_BYTES) throw new SquareImageError("size");
  const kind = detectImageKind(input);
  if (!kind) throw new SquareImageError("type");

  let base: Sharp;
  try {
    // failOn "error": refuse truncated or corrupt files instead of guessing.
    base = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS, animated: false });
    const meta = await base.metadata();
    if (meta.format !== kind) throw new SquareImageError("type");
    const shortest = Math.min(meta.autoOrient?.width ?? meta.width ?? 0, meta.autoOrient?.height ?? meta.height ?? 0);
    if (shortest < MIN_SIDE) throw new SquareImageError("tooSmall");
  } catch (error) {
    if (error instanceof SquareImageError) throw error;
    throw new SquareImageError("unreadable");
  }

  try {
    const entries = await Promise.all(
      SQUARE_IMAGE_SIZES.map(async (px) => {
        const out = await base
          .clone()
          // Apply the EXIF orientation to the pixels, then the metadata is gone.
          .rotate()
          .resize(px, px, { fit: "cover", position: "centre", withoutEnlargement: false })
          .flatten({ background: "#ffffff" })
          .toColourspace("srgb")
          .webp({ quality: 82, effort: 4 })
          .toBuffer();
        return [px, out] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<SquareImagePixels, Buffer>;
  } catch {
    throw new SquareImageError("unreadable");
  }
}
