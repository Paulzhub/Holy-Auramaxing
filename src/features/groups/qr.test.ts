// @vitest-environment node
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { renderInviteQr } from "./qr";

const link = "http://localhost:3000/join/AbCdEfGhIjKlMnOpQrStUvWxYz0";

describe("renderInviteQr", () => {
  const { svg, size } = renderInviteQr(link, 'Invite QR "code" <for> you & me');

  it("is a labelled image, with the label escaped", () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Invite QR &#34;code&#34; &#60;for&#62; you &#38; me"');
  });

  it("uses no inline style attributes (CSP) and no scripts or links", () => {
    expect(svg).not.toMatch(/\sstyle=/);
    expect(svg).not.toMatch(/<script|href=|on[a-z]+=/i);
  });

  it("keeps a quiet zone of four modules", () => {
    expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`);
    const modules = QRCode.create(link, { errorCorrectionLevel: "H" }).modules.size;
    expect(size).toBe(modules + 8);
  });

  it("stays small enough to send in a page", () => {
    expect(svg.length).toBeLessThan(12_000);
  });

  it("renders as an image (decoding is checked by hand with a phone and jsQR; see D-037)", async () => {
    const png = await sharp(Buffer.from(svg)).resize(300, 300).png().toBuffer();
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(300);
  });
});
