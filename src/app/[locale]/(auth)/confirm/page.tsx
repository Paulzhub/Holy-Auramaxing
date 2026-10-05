import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AuthHeading } from "@/features/auth";
import { ConfirmLinkForm } from "@/features/auth/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("confirm") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const types = ["signup", "email", "magiclink", "recovery", "email_change"];

/** Every email link lands here; one press of the button uses the link. */
export default async function ConfirmPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("auth.confirm");
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" && types.includes(params.type) ? params.type : "";
  const next = typeof params.next === "string" ? params.next : undefined;

  if (!tokenHash || !type) {
    return (
      <div className="auth-card">
        <AuthHeading title={t("invalidTitle")} lede={t("invalidLede")} />
        <p className="auth-switch">
          <Link href="/sign-in">{t("toSignIn")}</Link>
        </p>
      </div>
    );
  }
  const purpose =
    type === "recovery"
      ? "recovery"
      : type === "email_change"
        ? "emailChange"
        : type === "signup"
          ? "signup"
          : "signIn";
  return (
    <div className="auth-card">
      <AuthHeading title={t(`${purpose}.title`)} lede={t(`${purpose}.lede`)} />
      <ConfirmLinkForm tokenHash={tokenHash} type={type} next={next} />
    </div>
  );
}
