import sharp from "sharp";

/**
 * The invite's QR code as a PNG (D-127): most phones and chat apps (WhatsApp
 * among them) won't take an SVG image. Drawn on the server from our own SVG
 * (no user content in it), 1024 px square, as a data: URL that the page can
 * save or share. Null if it can't be drawn; the SVG download still works.
 */
export async function inviteQrPng(svg: string): Promise<string | null> {
  try {
    const png = await sharp(Buffer.from(svg), { density: 600 })
      .resize(1024, 1024, { fit: "contain", background: "#fffdf6" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}
