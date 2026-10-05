import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** Short messages a redirect can ask a page to show, e.g. /sign-in?notice=signed-out. */
export const authNotices = [
  "expired",
  "start-here",
  "signed-out",
  "link-invalid",
  "google",
  "google-cancelled",
  "password-updated",
  "email-confirmed",
  "email-changed",
] as const;
export type AuthNoticeKey = (typeof authNotices)[number];

export function parseNotice(value: string | string[] | undefined): AuthNoticeKey | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return (authNotices as readonly string[]).includes(v ?? "") ? (v as AuthNoticeKey) : undefined;
}

/** Renders a known notice; unknown values are ignored, so the URL can't inject text. */
export async function AuthNotice({ notice }: { notice: string | string[] | undefined }) {
  const key = parseNotice(notice);
  if (!key) return null;
  const t = await getTranslations("auth.redirectNotices");
  return (
    <p className="auth-banner" role="status">
      <Info aria-hidden="true" />
      <span>{t(key)}</span>
    </p>
  );
}
