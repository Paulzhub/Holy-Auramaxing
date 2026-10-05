import sharp from "sharp";

/**
 * Test photos. `photoWithGps` is a JPEG carrying a camera make and a GPS
 * position (Bengaluru), like a phone photo. Used by unit and e2e tests.
 */
export const GPS_CAMERA_MAKE = "HolyTestCam";

export async function photoWithGps(width = 1200, height = 900): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 214, g: 160, b: 72 } } })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: GPS_CAMERA_MAKE, Model: "Model 1" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "12/1 58/1 4567/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "77/1 35/1 2345/100",
      },
    })
    .toBuffer();
}

/** True if the bytes contain an EXIF block with a GPS pointer (tag 0x8825, either byte order). */
export function hasGpsExif(bytes: Uint8Array): boolean {
  const b = Buffer.from(bytes);
  if (!b.includes(Buffer.from("Exif\0\0", "latin1"))) return false;
  return b.includes(Buffer.from([0x25, 0x88])) || b.includes(Buffer.from([0x88, 0x25]));
}

export async function plainPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 30, g: 60, b: 120, alpha: 0.5 } } })
    .png()
    .toBuffer();
}

/** Solid magenta: the stand-in screener rejects it (see screening.ts). */
export async function stubRejectedPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 255, g: 0, b: 255 } } })
    .jpeg()
    .toBuffer();
}
