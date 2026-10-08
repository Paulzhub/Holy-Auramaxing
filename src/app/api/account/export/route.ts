import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { exportAuthData, getAccount } from "@/features/auth";
import { exportCheckinsData } from "@/features/checkins";
import { exportGroupsData } from "@/features/groups";
import { exportProfileData } from "@/features/profile";
import { buildExportArchive, exportFileName } from "@/lib/data-export";
import { siteOrigin } from "@/lib/env";
import { consume } from "@/lib/security/rate-limit";
import { audit } from "@/lib/server/audit";
import { devLog } from "@/lib/server/dev-log";

export const dynamic = "force-dynamic";

/**
 * "Download my data" (CLAUDE.md §7.1, §11; D-032): one zip with data.json,
 * a CSV per table and the profile photo. A form POST, so it works without
 * JavaScript. Each module supplies its own part; later phases add theirs
 * here (check-ins, journal…).
 */
export async function POST(request: NextRequest) {
  const origin = siteOrigin(new URL(request.url).origin);
  const form = await request.formData().catch(() => null);
  const from = form?.get("from") === "closing" ? "/account-closing" : "/settings/data";
  const back = (notice: string) =>
    noStore(NextResponse.redirect(new URL(`${from}?notice=${notice}`, origin), { status: 303 }));

  // CSRF: the same check Server Actions make. Browsers send Origin with every
  // POST, and it must name this host.
  if (!sameOrigin(request)) return noStore(new NextResponse(null, { status: 403 }));

  const account = await getAccount();
  // Signed out, two-step code not entered yet, or signed out elsewhere: the
  // database would refuse every read anyway.
  if (!account?.profile || account.blocked) {
    return noStore(NextResponse.redirect(new URL("/sign-in", origin), { status: 303 }));
  }
  const { userId } = account;

  if (!(await consume("dataExportByUser", userId)).ok) return back("export-rate-limited");

  try {
    const generatedAt = new Date();
    const t = await getTranslations({ locale: "en", namespace: "accountData.export" });
    const parts = await Promise.all([
      exportAuthData(),
      exportProfileData(userId),
      exportGroupsData(userId),
      exportCheckinsData(userId),
    ]);
    const archive = buildExportArchive({ generatedAt, parts, readmeIntro: t("readme") });
    await audit("account.exported", userId);

    return noStore(
      new NextResponse(Buffer.from(archive), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${exportFileName(generatedAt)}"`,
          "Content-Length": String(archive.length),
          "X-Content-Type-Options": "nosniff",
        },
      }),
    );
  } catch (error) {
    devLog("export", error);
    return back("export-failed");
  }
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
