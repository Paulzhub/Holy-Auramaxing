import { ImageResponse } from "next/og";

import { SITE_NAME } from "../site";

import { OG_SIZE } from "./og-size";

export { OG_SIZE };

/**
 * Open Graph and Twitter card pictures (CLAUDE.md §12): the dawn palette,
 * the rising-sun mark and a headline. next/og is built into Next.js, so no
 * new package. The default font is used (satori can't read woff2).
 */
export function ogImage({ title, kicker }: { title: string; kicker: string }) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(180deg, #13112b 0%, #2a1f4a 45%, #8a4a6e 78%, #e6a82e 100%)",
        color: "#efecfa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 36, fontWeight: 700 }}>
        <svg width="64" height="64" viewBox="0 0 26 26">
          <path d="M3 18h20" stroke="#f2c14e" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 18a6 6 0 0 1 12 0" fill="none" stroke="#f2c14e" strokeWidth="2" />
        </svg>
        {SITE_NAME}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 28, letterSpacing: 4, textTransform: "uppercase", color: "#d9d4f0" }}>{kicker}</div>
        <div style={{ fontSize: title.length > 40 ? 64 : 76, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>
          {title}
        </div>
      </div>
    </div>,
    OG_SIZE,
  );
}
