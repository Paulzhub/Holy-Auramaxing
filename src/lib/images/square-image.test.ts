// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { GPS_CAMERA_MAKE, hasGpsExif, photoWithGps, plainPng } from "@/test/images";

import { IMAGE_MAX_BYTES, SquareImageError, detectImageKind, processSquareImage } from "./square-image";

describe("detectImageKind", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", async () => {
    expect(detectImageKind(await photoWithGps(100, 100))).toBe("jpeg");
    expect(detectImageKind(await plainPng(100, 100))).toBe("png");
    expect(
      detectImageKind(
        await sharp(await plainPng(100, 100))
          .webp()
          .toBuffer(),
      ),
    ).toBe("webp");
  });

  it("refuses everything else, whatever the file is called", async () => {
    expect(detectImageKind(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageKind(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(
      detectImageKind(
        await sharp(await plainPng(100, 100))
          .avif()
          .toBuffer(),
      ),
    ).toBeNull();
    expect(detectImageKind(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("processSquareImage", () => {
  it("returns three square WebP sizes", async () => {
    const out = await processSquareImage(await photoWithGps(1200, 900));
    for (const px of [96, 256, 512] as const) {
      const meta = await sharp(out[px]).metadata();
      expect(meta).toMatchObject({ format: "webp", width: px, height: px });
    }
  });

  it("removes GPS position and camera details", async () => {
    const original = await photoWithGps();
    expect(hasGpsExif(original)).toBe(true);
    expect(original.includes(Buffer.from(GPS_CAMERA_MAKE))).toBe(true);

    const out = await processSquareImage(original);
    for (const bytes of Object.values(out)) {
      expect(hasGpsExif(bytes)).toBe(false);
      expect(bytes.includes(Buffer.from(GPS_CAMERA_MAKE))).toBe(false);
      const meta = await sharp(bytes).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    }
  });

  it("flattens transparency instead of keeping an alpha channel", async () => {
    const out = await processSquareImage(await plainPng(200, 300));
    expect((await sharp(out[256]).metadata()).hasAlpha).toBe(false);
  });

  it("refuses files that are not JPEG, PNG or WebP", async () => {
    await expect(processSquareImage(new TextEncoder().encode("<svg/>"))).rejects.toMatchObject({ reason: "type" });
  });

  it("refuses a file whose bytes say JPEG but which isn't one", async () => {
    const fake = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode("<script>alert(1)</script>")]);
    await expect(processSquareImage(fake)).rejects.toBeInstanceOf(SquareImageError);
  });

  it("refuses empty, oversized and tiny images", async () => {
    await expect(processSquareImage(new Uint8Array())).rejects.toMatchObject({ reason: "size" });
    await expect(processSquareImage(new Uint8Array(IMAGE_MAX_BYTES + 1))).rejects.toMatchObject({ reason: "size" });
    await expect(processSquareImage(await plainPng(40, 400))).rejects.toMatchObject({ reason: "tooSmall" });
  });
});
