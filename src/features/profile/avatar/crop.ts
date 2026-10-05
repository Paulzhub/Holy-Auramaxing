/**
 * Square-crop geometry for the on-device photo cropper. Pure, so it is
 * unit-tested and shared by the preview and the final export.
 *
 * zoom: 1 (the whole short side fits) to 3.
 * panX / panY: -100 to 100, the part of the photo to show (−100 = left/top
 * edge, 100 = right/bottom edge).
 */
export interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
/** Pixel size the browser sends; the server makes the smaller sizes. */
export const CROP_OUTPUT = 768;

export function cropRect(
  imageWidth: number,
  imageHeight: number,
  output: number,
  zoom: number,
  panX: number,
  panY: number,
): DrawRect {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const scale = (output / Math.min(imageWidth, imageHeight)) * z;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const clamp = (v: number) => Math.min(100, Math.max(-100, v)) / 100;
  // How far the image can move each way while still covering the square.
  const slackX = (width - output) / 2;
  const slackY = (height - output) / 2;
  return {
    // "+ 0" turns -0 into 0.
    x: -slackX - clamp(panX) * slackX + 0,
    y: -slackY - clamp(panY) * slackY + 0,
    width,
    height,
  };
}
