import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { AuthHeading } from "@/features/auth";
import { Link } from "@/i18n/navigation";

import { unsubscribeAction } from "../server/actions";
import { verifyUnsubscribe } from "../server/unsubscribe";

type Params = Record<string, string | string[] | undefined>;
const one = (v: Params[string]) => (typeof v === "string" ? v : null);

/** The page an email's "Stop these emails" link opens (D-092): one button, no sign-in. */
export async function UnsubscribeView({ params }: { params: Params }) {
  const t = await getTranslations("notifications");
  const status = one(params.status);
  const link = verifyUnsubscribe({ u: one(params.u), t: one(params.t), s: one(params.s) });
  const settings = (
    <p className="auth-switch">
      <Link href="/settings/notifications">{t("unsubscribe.settings")}</Link>
    </p>
  );
  if (status === "done") {
    return (
      <div className="auth-card">
        <AuthHeading title={t("unsubscribe.done")} />
        {settings}
      </div>
    );
  }
  if (!link || status === "invalid") {
    return (
      <div className="auth-card">
        <AuthHeading title={t("unsubscribe.invalid")} />
        {settings}
      </div>
    );
  }
  return (
    <div className="auth-card">
      <AuthHeading
        title={t("unsubscribe.title")}
        lede={
          link.kind === "digest"
            ? t("unsubscribe.ledeDigest")
            : t("unsubscribe.lede", { type: t(`settings.types.${link.kind}` as never) })
        }
      />
      <form action={unsubscribeAction}>
        <input type="hidden" name="u" value={one(params.u) ?? ""} />
        <input type="hidden" name="t" value={one(params.t) ?? ""} />
        <input type="hidden" name="s" value={one(params.s) ?? ""} />
        <button type="submit" className={buttonVariants({ variant: "primary" })}>
          {t("unsubscribe.confirm")}
        </button>
      </form>
      {settings}
    </div>
  );
}
