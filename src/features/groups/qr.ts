import QRCode from "qrcode";

/**
 * Invite QR codes in the app's own look (CLAUDE.md §8, §13; D-037). Server
 * only: the SVG is drawn here, so no QR code library reaches the browser.
 *
 *  - Error correction "H" (about 30% of the code can be covered and still
 *    scan), so a small sunrise mark can sit in the middle.
 *  - Dark modules are indigo dots; the three corner "eyes" are rounded,
 *    with a gold-ringed sunrise at the centre, on a warm dawn-white card.
 *  - Every colour that a scanner reads is dark indigo on near-white (well
 *    over 10:1), so the styling never costs scannability. A unit test
 *    decodes the result.
 *  - Attributes only, no style="" (the CSP allows no inline styles).
 */

const COLOURS = {
  card: "#fffdf6",
  frame: "#e6a82e",
  ink: "#1d1940",
  eye: "#3b3391",
  sun: "#e6a82e",
  sunEdge: "#a86e00",
} as const;

/** Modules of empty space around the code (the spec's minimum is 4). */
const QUIET = 4;

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function round(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** A rounded rectangle as a path, so many shapes fit in one <path>. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${round(x + r)} ${round(y)}h${round(w - 2 * r)}a${round(r)} ${round(r)} 0 0 1 ${round(r)} ${round(r)}` +
    `v${round(h - 2 * r)}a${round(r)} ${round(r)} 0 0 1 ${round(-r)} ${round(r)}` +
    `h${round(-(w - 2 * r))}a${round(r)} ${round(r)} 0 0 1 ${round(-r)} ${round(-r)}` +
    `v${round(-(h - 2 * r))}a${round(r)} ${round(r)} 0 0 1 ${round(r)} ${round(-r)}z`
  );
}

export interface InviteQr {
  svg: string;
  /** Modules per side, including the quiet zone. */
  size: number;
}

export function renderInviteQr(text: string, label: string): InviteQr {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const dark = (row: number, col: number) => qr.modules.get(row, col) === 1;
  const total = n + QUIET * 2;

  // The three finder patterns (7×7 in the corners) are drawn separately.
  const eyes: [number, number][] = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ];
  const inEye = (r: number, c: number) => eyes.some(([er, ec]) => r >= er && r < er + 7 && c >= ec && c < ec + 7);

  // The centre mark: an odd number of modules, about a fifth of the code.
  let logo = Math.round(n * 0.22);
  if (logo % 2 === 0) logo += 1;
  const logoStart = (n - logo) / 2;
  const inLogo = (r: number, c: number) =>
    r >= logoStart - 0.5 && r < logoStart + logo + 0.5 && c >= logoStart - 0.5 && c < logoStart + logo + 0.5;

  // Runs of dark modules in a row become one soft pill: a small file, and
  // solid runs that scanners read easily.
  const on = (r: number, c: number) => dark(r, c) && !inEye(r, c) && !inLogo(r, c);
  let dots = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!on(r, c)) {
        c += 1;
        continue;
      }
      const from = c;
      while (c < n && on(r, c)) c += 1;
      // A round-capped stroke: a dot for one module, a pill for a run.
      dots += `M${from + QUIET + 0.5} ${r + QUIET + 0.5}h${c - from - 1}`;
    }
  }

  let eyePaths = "";
  let eyeCores = "";
  for (const [er, ec] of eyes) {
    const x = ec + QUIET;
    const y = er + QUIET;
    // Outer ring: a 7×7 rounded square minus a 5×5 one (even-odd fill).
    eyePaths += roundedRect(x, y, 7, 7, 1.6) + roundedRect(x + 1, y + 1, 5, 5, 0.9);
    eyeCores += roundedRect(x + 2, y + 2, 3, 3, 0.7);
  }

  // The sunrise, drawn in a box `logo` modules wide at the centre.
  const lx = logoStart + QUIET;
  const ly = logoStart + QUIET;
  const s = logo / 32; // the brand mark is drawn on a 32-unit grid
  const at = (u: number) => round(u * s);
  const mark =
    `<rect x="${round(lx - 0.3)}" y="${round(ly - 0.3)}" width="${round(logo + 0.6)}" height="${round(logo + 0.6)}"` +
    ` rx="${round(logo * 0.28)}" fill="${COLOURS.card}" stroke="${COLOURS.frame}" stroke-width="0.35"/>` +
    `<g transform="translate(${round(lx)} ${round(ly)})">` +
    `<path d="M${at(6)} ${at(21)}a${at(10)} ${at(10)} 0 0 1 ${at(20)} 0Z" fill="${COLOURS.sun}"` +
    ` stroke="${COLOURS.sunEdge}" stroke-width="${at(1.5)}"/>` +
    `<path d="M${at(16)} ${at(5.5)}v${at(3)}M${at(7.2)} ${at(9.2)}l${at(2.1)} ${at(2.1)}M${at(24.8)} ${at(9.2)}` +
    `l${at(-2.1)} ${at(2.1)}M${at(3.5)} ${at(16)}h${at(3)}M${at(25.5)} ${at(16)}h${at(3)}"` +
    ` stroke="${COLOURS.sunEdge}" stroke-width="${at(2)}" stroke-linecap="round" fill="none"/>` +
    `<path d="M${at(3)} ${at(24.5)}h${at(26)}" stroke="${COLOURS.ink}" stroke-width="${at(2)}" stroke-linecap="round"/>` +
    `</g>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="${escapeXml(label)}">` +
    `<rect x="0.25" y="0.25" width="${total - 0.5}" height="${total - 0.5}" rx="3" fill="${COLOURS.card}"` +
    ` stroke="${COLOURS.frame}" stroke-width="0.5"/>` +
    `<path d="${dots}" stroke="${COLOURS.ink}" stroke-width="0.9" stroke-linecap="round" fill="none"/>` +
    `<path d="${eyePaths}" fill="${COLOURS.eye}" fill-rule="evenodd"/>` +
    `<path d="${eyeCores}" fill="${COLOURS.ink}"/>` +
    mark +
    `</svg>`;

  return { svg, size: total };
}
