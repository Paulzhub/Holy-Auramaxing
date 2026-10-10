import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAccount } from "@/features/auth";
import { canShareLevel, getMyLevel, shareCardText } from "@/features/gamification";
import { devLog } from "@/lib/server/dev-log";

export const dynamic = "force-dynamic";

/**
 * The optional share card (CLAUDE.md §7.6): a picture of the person's own
 * current level to save and share if they want to. Discreet by design
 * (§2.3, D-055): the level's name, era and verse reference and the app's
 * name, nothing about days, streaks or what the app is for, and no verse
 * text (a few level verses name the struggle). discretion.test.ts scans it.
 */
export async function GET() {
  const account = await getAccount();
  if (!account?.profile || account.blocked) return new NextResponse(null, { status: 401, headers: noStore });

  try {
    const [level, t] = await Promise.all([
      getMyLevel(),
      getTranslations({ locale: "en", namespace: "levels.shareCard" }),
    ]);
    if (!canShareLevel(level)) return new NextResponse(null, { status: 404, headers: noStore });
    const text = shareCardText(level, (key, values) => t(key, values));
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: 80,
          background: "linear-gradient(180deg, #fdf6e9 0%, #f6dfb8 55%, #e9b872 100%)",
          color: "#2a2340",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, letterSpacing: 4, textTransform: "uppercase", color: "#6b4f1d" }}>
          {text.levelAndEra}
        </div>
        <div style={{ fontSize: 104, fontWeight: 700, lineHeight: 1.1 }}>{text.label}</div>
        <div style={{ fontSize: 40, color: "#4a3f63" }}>{text.reference}</div>
        <div style={{ marginTop: 60, fontSize: 32, color: "#6b4f1d" }}>{text.footer}</div>
      </div>,
      { width: 1080, height: 1080, headers: noStore },
    );
  } catch (error) {
    devLog("share-level", error);
    return new NextResponse(null, { status: 500, headers: noStore });
  }
}

const noStore = { "Cache-Control": "private, no-store" };
